			// Constants
			const INCOMING_CALL_TIMEOUT_MS = 30000;
			const DTMF_DURATION_MS = 250;
			const DTMF_INTERTONE_GAP_MS = 100;
			const SIP_REGISTRATION_EXPIRES_SEC = 300;
			const USERNAME_LENGTH = 10;
			const APP_VERSION = window.VOICETEL_VERSION || "3.5.5";
			const SIP_DOMAIN = window.VOICETEL_SIP_DOMAIN || "tls.voicetel.com";
			const SIP_SERVER = window.VOICETEL_SIP_SERVER || "wss://tls.voicetel.com:443";

			// Configure localforage
			localforage.config({
				name: "VoiceTel",
				storeName: "config",
			});

			// Simple Storage Manager
			const Storage = {
				CONFIG_KEY: "voicetel_config",
				HISTORY_KEY: "voicetel_history",

				async saveConfig() {
					try {
						const saveEnabled =
							document.getElementById("saveCredentials").checked;

						if (!saveEnabled) {
							await localforage.removeItem(this.CONFIG_KEY);
							return;
						}

						const config = {
							username: document.getElementById("username").value,
							password: document.getElementById("password").value,
							displayName:
								document.getElementById("displayName").value,
							callerID: document.getElementById("callerID").value,
							hideCallerID:
								document.getElementById("hideCallerID").checked,
							registerOnStartup:
								document.getElementById("registerOnStartup")
									.checked,
							saveCredentials: true,
						};

						await localforage.setItem(this.CONFIG_KEY, config);

						// Show saved indicator
						const info = document.getElementById("storageInfo");
						info.style.display = "block";
						setTimeout(() => {
							info.style.display = "none";
						}, 2000);

						log("Configuration saved locally");
					} catch (e) {
						console.error("Save failed:", e);
						log("Failed to save configuration");
					}
				},

				async loadConfig() {
					try {
						const config = await localforage.getItem(
							this.CONFIG_KEY,
						);

						if (!config) return;

						// Restore form fields
						if (config.username)
							document.getElementById("username").value =
								config.username;
						if (config.password)
							document.getElementById("password").value =
								config.password;
						if (config.displayName)
							document.getElementById("displayName").value =
								config.displayName;
						if (config.callerID)
							document.getElementById("callerID").value =
								config.callerID;

						// Restore checkboxes
						document.getElementById("hideCallerID").checked =
							config.hideCallerID || false;
						document.getElementById("registerOnStartup").checked =
							config.registerOnStartup || false;
						document.getElementById("saveCredentials").checked =
							config.saveCredentials || false;

						log("Configuration loaded from local storage");

						// Auto-register if enabled
						if (
							config.registerOnStartup &&
							config.username &&
							config.password
						) {
							setTimeout(() => {
								log("Auto-registering...");
								register();
							}, 500);
						}
					} catch (e) {
						console.error("Load failed:", e);
					}
				},

				async clearAll() {
					await localforage.removeItem(this.CONFIG_KEY);
					await localforage.removeItem(this.HISTORY_KEY);
					log("All saved data cleared");
				},

				async addCallToHistory(type, number, duration) {
					try {
						const history =
							(await localforage.getItem(this.HISTORY_KEY)) || [];
						history.unshift({
							type,
							number,
							duration,
							timestamp: new Date().toISOString(),
						});

						// Keep last 100 calls
						if (history.length > 100) {
							history.length = 100;
						}

						await localforage.setItem(this.HISTORY_KEY, history);
					} catch (e) {
						console.error("History save failed:", e);
					}
				},

				async getHistory() {
					return (await localforage.getItem(this.HISTORY_KEY)) || [];
				},

				async clearHistory() {
					await localforage.removeItem(this.HISTORY_KEY);
				},
			};

			// Global variables for SIP
			let registeredUsername = null;
			let userAgent = null;
			let currentSession = null;
			let incomingSession = null;
			let incomingCallTimeout = null;
			let isRegistered = false;
			let isMuted = false;
			let callTimer = null;
			let callStartTime = null;
			let ringingAudio = null;
			
			// Event listener cleanup tracking
			let activeEventListeners = new Set();
			let webSocketMessageHandler = null;

			// Call tracking for history
			let __callDirection = null;
			let __answeredIncoming = false;
			let __incomingRaw = null;
			let __incomingDisplay = null;

			// Username validation
			function isValidUsername(username) {
				return (
					username &&
					/^\d{10}$/.test(username) &&
					username.length === USERNAME_LENGTH
				);
			}

			function validateNorthAmericanNumber(number) {
				const cleaned = number.replace(/\D/g, "");
				if (cleaned.length !== USERNAME_LENGTH) return false;
				const npaFirstDigit = parseInt(cleaned[0]);
				const nxxFirstDigit = parseInt(cleaned[3]);
				return (
					npaFirstDigit >= 2 &&
					npaFirstDigit <= 9 &&
					nxxFirstDigit >= 2 &&
					nxxFirstDigit <= 9
				);
			}

			// Ringing tone generation
			function createRingingTone() {
				const audioContext = new (window.AudioContext ||
					window.webkitAudioContext)();
				const oscillator1 = audioContext.createOscillator();
				const oscillator2 = audioContext.createOscillator();
				const gainNode = audioContext.createGain();

				oscillator1.frequency.value = 440;
				oscillator2.frequency.value = 480;
				oscillator1.type = "sine";
				oscillator2.type = "sine";

				gainNode.gain.setValueAtTime(0, audioContext.currentTime);

				const ringPattern = () => {
					const now = audioContext.currentTime;
					gainNode.gain.setValueAtTime(0.1, now);
					gainNode.gain.setValueAtTime(0.1, now + 2);
					gainNode.gain.setValueAtTime(0, now + 2.01);
					gainNode.gain.setValueAtTime(0, now + 6);
				};

				oscillator1.connect(gainNode);
				oscillator2.connect(gainNode);
				gainNode.connect(audioContext.destination);

				oscillator1.start();
				oscillator2.start();

				ringPattern();
				const ringInterval = setInterval(ringPattern, 6000);

				return {
					stop: () => {
						clearInterval(ringInterval);
						gainNode.gain.setValueAtTime(
							0,
							audioContext.currentTime,
						);
						setTimeout(() => {
							oscillator1.stop();
							oscillator2.stop();
							audioContext.close();
						}, 100);
					},
				};
			}

			function startRinging() {
				document.getElementById("ringingIndicator").style.display =
					"block";
				document.getElementById("callStatus").textContent =
					"Ringing...";

				try {
					ringingAudio = createRingingTone();
				} catch (e) {
					log("Could not generate ringing tone: " + e.message);
				}
			}

			function stopRinging() {
				document.getElementById("ringingIndicator").style.display =
					"none";
				document.getElementById("callStatus").textContent =
					"Call in progress";

				if (ringingAudio) {
					ringingAudio.stop();
					ringingAudio = null;
				}
			}

			// Logging function
			function log(message) {
				const logDiv = document.getElementById("log");
				const entry = document.createElement("div");
				entry.className = "log-entry";
				const timestamp = new Date().toLocaleTimeString();
				entry.textContent = `[${timestamp}] ${message}`;
				logDiv.insertBefore(entry, logDiv.firstChild);

				while (logDiv.children.length > 10) {
					logDiv.removeChild(logDiv.lastChild);
				}
			}

			function updateStatus(text, registered = false) {
				const statusEl = document.getElementById("status");
				statusEl.textContent = text;
				if (registered) {
					statusEl.classList.add("registered");
				} else {
					statusEl.classList.remove("registered");
				}
			}

			// SIP Registration
			function register() {
				if (typeof SIP === "undefined") {
					alert(
						"SIP.js library is not loaded. Please refresh the page.",
					);
					log("Error: SIP.js library not available");
					return;
				}

				const server = document.getElementById("sipServer").value;
				const username = document.getElementById("username").value;
				const password = document.getElementById("password").value;
				const displayName =
					document.getElementById("displayName").value || username;
				const callerID = document.getElementById("callerID").value;

				if (!server || !username || !password) {
					alert("Please fill in all required fields");
					return;
				}

				if (!isValidUsername(username)) {
					alert("Username must be exactly 10 numeric digits");
					document.getElementById("usernameError").style.display =
						"block";
					return;
				}

				registeredUsername = username;

				try {
					log("Starting registration...");
					log(`Connecting to VoiceTel server (${SIP_DOMAIN})...`);

					const uri = `sip:${username}@${SIP_DOMAIN}`;

					const transportOptions = {
						wsServers: [server],
						traceSip: true,
						wsServerMaxReconnectionAttempts: 5,
						wsServerReconnectionTimeout: 4,
					};

					const userAgentOptions = {
						uri: uri,
						transportOptions: transportOptions,
						authorizationUser: username,
						password: password,
						displayName: displayName,
						register: true,
						registerOptions: {
							registrar: `sip:${SIP_DOMAIN}`,
							expires: SIP_REGISTRATION_EXPIRES_SEC,
						},
						sessionDescriptionHandlerFactoryOptions: {
							constraints: {
								audio: true,
								video: false,
							},
							peerConnectionOptions: {
								rtcConfiguration: {
									iceServers: [
										{
											urls: "stun:stun.l.google.com:19302",
										},
										{
											urls: "stun:stun1.l.google.com:19302",
										},
									],
								},
							},
						},
						hackWssInTransport: false,
						hackIpInContact: true,
						dtmfType: "rtp",
						userAgentString: `VoiceTel/${APP_VERSION}`,
					};

					userAgent = new SIP.UA(userAgentOptions);

					userAgent.on("registered", () => {
						isRegistered = true;
						updateStatus("Registered", true);
						log("Successfully registered");
						log("SIP/2.0 200 OK");

						document.getElementById("registerBtn").disabled = true;
						document.getElementById("unregisterBtn").disabled =
							false;
						document.getElementById("callBtn").disabled = false;

						if (
							"Notification" in window &&
							Notification.permission === "default"
						) {
							Notification.requestPermission().then(
								(permission) => {
									if (permission === "granted") {
										log(
											"Desktop notifications enabled for incoming calls",
										);
									}
								},
							);
						}
					});

					userAgent.on("registrationFailed", (response, cause) => {
						if (
							response &&
							response.status_code &&
							response.reason_phrase
						) {
							log(
								`SIP/2.0 ${response.status_code} ${response.reason_phrase}`,
							);
						}
						log(`Registration failed: ${cause}`);
						updateStatus("Registration Failed");
					});

					userAgent.on("unregistered", () => {
						log("SIP/2.0 200 OK (Unregistered)");
					});

					userAgent.on("invite", (session) => {
						const callerInfo =
							session.remoteIdentity.displayName ||
							session.remoteIdentity.uri.user;
						log(`Incoming call from ${callerInfo}`);

						if (
							"Notification" in window &&
							Notification.permission === "granted"
						) {
							new Notification("VoiceTel Phone", {
								body: `Incoming call from ${callerInfo}`,
								icon: "📞",
								requireInteraction: true,
							});
						}

						handleIncomingCall(session);
					});

					userAgent.start();
				} catch (error) {
					log(`Registration failed: ${error.message}`);
					updateStatus("Registration Failed");
					console.error(error);
				}
			}

			function unregister() {
				try {
					// Clean up WebSocket event listeners
					if (userAgent && userAgent.transport && userAgent.transport.ws && webSocketMessageHandler) {
						userAgent.transport.ws.removeEventListener("message", webSocketMessageHandler);
						webSocketMessageHandler = null;
					}
					
					if (userAgent) {
						userAgent.unregister();
						userAgent.stop();
						userAgent = null;
					}

					isRegistered = false;
					registeredUsername = null;
					updateStatus("Disconnected");
					log("Unregistered successfully");

					document.getElementById("registerBtn").disabled = false;
					document.getElementById("unregisterBtn").disabled = true;
					document.getElementById("callBtn").disabled = true;
				} catch (error) {
					log(`Unregister failed: ${error.message}`);
					console.error(error);
				}
			}

			// Make outgoing call
			function makeCall() {
				let number = document.getElementById("callNumber").value;
				const originalNumber = number;
				number = number.replace(/\D/g, "");

				if (originalNumber !== number && originalNumber.length > 0) {
					log(`Sanitized number: "${originalNumber}" → "${number}"`);
				}

				if (!number) {
					alert("Please enter a number to call");
					return;
				}

				if (!isRegistered || !userAgent) {
					alert("Please register first");
					return;
				}

				if (incomingSession) {
					alert("Please answer or decline the incoming call first");
					return;
				}

				const callerID = document
					.getElementById("callerID")
					.value.replace(/\D/g, "");
				if (callerID && !validateNorthAmericanNumber(callerID)) {
					alert(
						"Please enter a valid 10-digit North American phone number for Caller ID",
					);
					document.getElementById("callerIDError").style.display =
						"block";
					return;
				}

				try {
					const displayName =
						document.getElementById("displayName").value ||
						registeredUsername;
					const hideCallerID =
						document.getElementById("hideCallerID").checked;

					const domain = SIP_DOMAIN;
					const uri = `sip:${number}@${domain}`;

					const options = {
						sessionDescriptionHandlerOptions: {
							constraints: {
								audio: true,
								video: false,
							},
						},
					};

					options.extraHeaders = [];

					let pAssertedIdentity;
					if (callerID && validateNorthAmericanNumber(callerID)) {
						const formattedNumber = "+1" + callerID;
						pAssertedIdentity = `"${displayName}" <sip:${formattedNumber}@${SIP_DOMAIN}>`;
						log(
							`Setting caller ID: ${displayName} ${formattedNumber}`,
						);
					} else {
						pAssertedIdentity = `"${displayName}" <sip:${registeredUsername}@${SIP_DOMAIN}>`;
						log(
							`Using default caller ID: ${displayName} ${registeredUsername}`,
						);
					}

					options.extraHeaders.push(
						"P-Asserted-Identity: " + pAssertedIdentity,
					);
					options.extraHeaders.push(
						"P-Preferred-Identity: " + pAssertedIdentity,
					);

					if (hideCallerID) {
						options.extraHeaders.push("Privacy: id");
						log("Caller ID privacy enabled");
					} else {
						options.extraHeaders.push("Privacy: none");
					}

					currentSession = userAgent.invite(uri, options);
					__callDirection = "outgoing";

					let sessionRingingStarted = false;

					if (currentSession.request) {
						const callId = currentSession.request.callId;

						// Store the message handler for cleanup
						webSocketMessageHandler = function (e) {
							if (e && e.data && e.data.includes(callId)) {
								const lines = e.data.split("\r\n");
								for (let line of lines) {
									if (line.startsWith("SIP/2.0")) {
										log(line);
										if (
											!sessionRingingStarted &&
											(line.includes("180 Ringing") ||
												line.includes(
													"183 Session Progress",
												))
										) {
											startRinging();
											sessionRingingStarted = true;
										}
										if (
											sessionRingingStarted &&
											line.includes("200 OK")
										) {
											stopRinging();
											sessionRingingStarted = false;
										}
										break;
									}
								}
							}
						};

						if (userAgent.transport && userAgent.transport.ws) {
							userAgent.transport.ws.addEventListener(
								"message",
								webSocketMessageHandler,
							);

							currentSession.on("terminated", () => {
								if (sessionRingingStarted) {
									stopRinging();
									sessionRingingStarted = false;
								}
								if (userAgent.transport && userAgent.transport.ws && webSocketMessageHandler) {
									userAgent.transport.ws.removeEventListener(
										"message",
										webSocketMessageHandler,
									);
									webSocketMessageHandler = null;
								}
							});
							currentSession.on("failed", () => {
								if (sessionRingingStarted) {
									stopRinging();
									sessionRingingStarted = false;
								}
								if (userAgent.transport && userAgent.transport.ws && webSocketMessageHandler) {
									userAgent.transport.ws.removeEventListener(
										"message",
										webSocketMessageHandler,
									);
									webSocketMessageHandler = null;
								}
							});
						}
					}

					setupSessionHandlers(currentSession);

					log(`Calling ${number}...`);
					log("SIP INVITE sent");
					showCallControls();
				} catch (error) {
					log(`Call failed: ${error.message}`);
					console.error(error);
				}
			}

			// Handle incoming call
			function handleIncomingCall(session) {
				__incomingRaw = null;
				__incomingDisplay = null;

				if (currentSession) {
					log("Auto-rejecting incoming call - already in a call");
					session.reject();
					log("SIP/2.0 486 Busy Here");
					return;
				}

				incomingSession = session;
				log("SIP INVITE received");

				const callerUri =
					session.remoteIdentity &&
					session.remoteIdentity.uri &&
					session.remoteIdentity.uri.user
						? session.remoteIdentity.uri.user
						: "Unknown";
				__incomingRaw = callerUri;
				const callerName =
					session.remoteIdentity.displayName || "Unknown";

				let formattedNumber = callerUri;
				if (/^\d{10}$/.test(callerUri)) {
					formattedNumber = `(${callerUri.slice(0, 3)}) ${callerUri.slice(3, 6)}-${callerUri.slice(6)}`;
				} else if (/^\+1\d{10}$/.test(callerUri)) {
					const num = callerUri.slice(2);
					formattedNumber = `+1 (${num.slice(0, 3)}) ${num.slice(3, 6)}-${num.slice(6)}`;
				}

				document.getElementById("incomingCallerName").textContent =
					callerName;
				document.getElementById("incomingCallerNumber").textContent =
					formattedNumber;
				__incomingDisplay = formattedNumber;

				document.getElementById("incomingCall").classList.add("active");

				startRinging();
				log("SIP/2.0 180 Ringing");
				log(`Incoming call from ${callerName} ${formattedNumber}`);
				log("Press Enter to answer or Escape to decline");

				incomingCallTimeout = setTimeout(() => {
					if (incomingSession) {
						log("Auto-declining unanswered call after 30 seconds");
						declineCall();
					}
				}, INCOMING_CALL_TIMEOUT_MS);

				setupIncomingSessionHandlers(session);
			}

			function setupIncomingSessionHandlers(session) {
				// Track if this incoming call was answered
				let wasAnswered = false;

				session.on("terminated", () => {
					if (incomingCallTimeout) {
						clearTimeout(incomingCallTimeout);
						incomingCallTimeout = null;
					}
					hideIncomingCallUI();
					stopRinging();

					// Only add "missed" if it was NOT answered and NOT manually declined
					if (!wasAnswered && !session.__declinedByUser) {
						log("Incoming call ended by caller (missed)");
						const num =
							__incomingRaw && __incomingRaw !== "Unknown"
								? __incomingRaw
								: __incomingDisplay || "Unknown";
						Storage.addCallToHistory("missed", num, "00:00");
					}

					incomingSession = null;
				});

				session.on("failed", () => {
					if (incomingCallTimeout) {
						clearTimeout(incomingCallTimeout);
						incomingCallTimeout = null;
					}
					hideIncomingCallUI();
					stopRinging();
					log("Incoming call failed");
					incomingSession = null;
				});

				session.on("rejected", () => {
					if (incomingCallTimeout) {
						clearTimeout(incomingCallTimeout);
						incomingCallTimeout = null;
					}
					hideIncomingCallUI();
					stopRinging();
					log("Incoming call was rejected");
					incomingSession = null;
				});

				// Mark as answered when accepted
				session.on("accepted", () => {
					wasAnswered = true;
				});
			}

			function answerCall() {
				if (!incomingSession) {
					log("No incoming call to answer");
					return;
				}

				if (incomingCallTimeout) {
					clearTimeout(incomingCallTimeout);
					incomingCallTimeout = null;
				}

				// Transfer session to current and mark as answered
				currentSession = incomingSession;
				incomingSession = null; // Clear incoming reference IMMEDIATELY
				__callDirection = "incoming";
				__answeredIncoming = true;

				hideIncomingCallUI();
				setupSessionHandlers(currentSession);
				currentSession.accept();

				stopRinging();
				showCallControls();
				log("Call answered");
				log("SIP/2.0 200 OK");
			}

			function declineCall() {
				if (!incomingSession) {
					log("No incoming call to decline");
					return;
				}

				if (incomingCallTimeout) {
					clearTimeout(incomingCallTimeout);
					incomingCallTimeout = null;
				}

				// Record as declined (this is correct for a manual press)
				const num =
					__incomingRaw && __incomingRaw !== "Unknown"
						? __incomingRaw
						: __incomingDisplay ||
							document.getElementById("incomingCallerNumber")
								.textContent ||
							"Unknown";
				Storage.addCallToHistory("declined", num, "00:00");

				// mark this specific incoming session as manually declined
				incomingSession.__declinedByUser = true;

				// Send busy
				incomingSession.reject({
					statusCode: 486,
					reasonPhrase: "Busy Here",
				});

				hideIncomingCallUI();
				stopRinging();
				log("Call declined");
				log("SIP/2.0 486 Busy Here");
				incomingSession = null;
			}

			function hideIncomingCallUI() {
				document
					.getElementById("incomingCall")
					.classList.remove("active");
				document.getElementById("incomingCallerName").textContent =
					"Incoming Call";
				document.getElementById("incomingCallerNumber").textContent =
					"Unknown Number";
			}

			function setupSessionHandlers(session) {
				let ringingStarted = false;

				if (session.on) {
					session.on("response", (response) => {
						if (
							response &&
							response.status_code &&
							response.reason_phrase
						) {
							log(
								`SIP/2.0 ${response.status_code} ${response.reason_phrase}`,
							);

							if (
								!ringingStarted &&
								(response.status_code === 180 ||
									response.status_code === 183)
							) {
								startRinging();
								ringingStarted = true;
							}

							if (response.status_code === 200) {
								if (ringingStarted) {
									stopRinging();
									ringingStarted = false;
								}
								// Start timer immediately when we get 200 OK
								startCallTimer();
							}
						}
					});

					session.on("progress", (response) => {
					if (
						response &&
						response.status_code &&
						response.reason_phrase
					) {
						log(
							`SIP/2.0 ${response.status_code} ${response.reason_phrase}`,
						);

						if (
							!ringingStarted &&
							(response.status_code === 180 ||
								response.status_code === 183)
						) {
							startRinging();
							ringingStarted = true;
						}

						// Mute early media if we receive 183
						if (response.status_code === 183) {
							const remoteAudio =
								document.getElementById("remoteAudio");
							if (remoteAudio) {
								remoteAudio.volume = 0; // Silence server audio during ringing
								log("Early media muted during ringing");
							}
						}
					}
				});

				session.on("terminated", (message, cause) => {
					if (ringingStarted) {
						stopRinging();
						ringingStarted = false;
					}
					log("Call ended" + (cause ? ": " + cause : ""));
					endCall();
				});

				session.on("failed", (response, cause) => {
					if (
						response &&
						response.status_code &&
						response.reason_phrase
					) {
						log(
							`SIP/2.0 ${response.status_code} ${response.reason_phrase}`,
						);
					}

					if (ringingStarted) {
						stopRinging();
						ringingStarted = false;
					}

					if (
						cause &&
						cause.includes("SESSION_DESCRIPTION_HANDLER_ERROR")
					) {
						log(
							"⚠️ Media negotiation failed - incompatible media format",
						);
						alert(
							"Call failed: Media format incompatibility.\nContact VoiceTel support for WebRTC configuration.",
						);
					} else {
						log("Call failed: " + (cause || "Unknown error"));
					}
					endCall();
				});

				session.on("rejected", (response, cause) => {
					if (
						response &&
						response.status_code &&
						response.reason_phrase
					) {
						log(
							`SIP/2.0 ${response.status_code} ${response.reason_phrase}`,
						);
					}
					log("Call rejected" + (cause ? ": " + cause : ""));
					if (ringingStarted) {
						stopRinging();
						ringingStarted = false;
					}
					endCall();
				});

				session.on("bye", (request) => {
					log("SIP BYE received");
					log("Call ended by remote");
					if (ringingStarted) {
						stopRinging();
						ringingStarted = false;
					}
					endCall();
				});

					session.on("accepted", (response) => {
						if (
							response &&
							response.status_code &&
							response.reason_phrase
						) {
							log(
								`SIP/2.0 ${response.status_code} ${response.reason_phrase}`,
							);
						}

						if (ringingStarted) {
							stopRinging();
							ringingStarted = false;
						}

						log("Call connected");

					if (
						currentSession &&
						currentSession.sessionDescriptionHandler &&
						currentSession.sessionDescriptionHandler.peerConnection
					) {
						const pc =
							currentSession.sessionDescriptionHandler
								.peerConnection;
						const remoteDesc = pc.remoteDescription;
						if (remoteDesc && remoteDesc.sdp) {
							if (remoteDesc.sdp.includes("telephone-event")) {
								log("Remote supports RFC 2833 telephone-event");
							} else {
								log(
									"⚠️ Remote does NOT support telephone-event - will use SIP INFO for DTMF",
								);
							}
						}
					}

					document.getElementById("callNumber").value = "";
					document.getElementById("callNumber").placeholder =
						"Type or press dialpad for DTMF";
					document.getElementById("callNumber").focus();

					startCallTimer();

					try {
						const pc =
							session.sessionDescriptionHandler.peerConnection;
						const remoteStream = new MediaStream();
						pc.getReceivers().forEach((receiver) => {
							if (receiver.track) {
								remoteStream.addTrack(receiver.track);
							}
						});

						const remoteAudio =
							document.getElementById("remoteAudio");
						remoteAudio.srcObject = remoteStream;
						remoteAudio.volume = 1.0; // Unmute when call connects
					} catch (e) {
						log("Error setting up audio: " + e.message);
					}
				});

				session.on("trackAdded", () => {
					try {
						const pc =
							session.sessionDescriptionHandler.peerConnection;
						const remoteStream = new MediaStream();
						pc.getReceivers().forEach((receiver) => {
							if (receiver.track) {
								remoteStream.addTrack(receiver.track);
							}
						});

						const remoteAudio =
							document.getElementById("remoteAudio");
						remoteAudio.srcObject = remoteStream;

						// Mute if still ringing (early media)
						if (ringingStarted) {
							remoteAudio.volume = 0;
							log("Early media audio track muted");
						}
					} catch (e) {
						log("Error handling track: " + e.message);
					}
				});
				}
			}

			function hangup() {
				stopRinging();
				if (currentSession) {
					if (currentSession.hasAnswer) {
						currentSession.bye();
						log("SIP BYE sent");
					} else {
						currentSession.cancel();
						log("SIP CANCEL sent");
					}
					log("Hanging up...");
				}
			}

			function toggleMute() {
				if (
					!currentSession ||
					!currentSession.sessionDescriptionHandler
				)
					return;

				const pc =
					currentSession.sessionDescriptionHandler.peerConnection;
				const senders = pc.getSenders();

				senders.forEach((sender) => {
					if (sender.track && sender.track.kind === "audio") {
						sender.track.enabled = isMuted;
					}
				});

				isMuted = !isMuted;
				document.getElementById("muteBtn").textContent = isMuted
					? "Unmute"
					: "Mute";
				log(isMuted ? "Muted" : "Unmuted");
			}

			function showCallControls() {
				document.getElementById("callControls").classList.add("active");
				document.getElementById("callBtn").disabled = true;
			}

			function hideCallControls() {
				document
					.getElementById("callControls")
					.classList.remove("active");
				document.getElementById("callBtn").disabled = false;
				stopCallTimer();
			}

			function endCall() {
				// Clean up WebSocket event listeners
				if (userAgent && userAgent.transport && userAgent.transport.ws && webSocketMessageHandler) {
					userAgent.transport.ws.removeEventListener("message", webSocketMessageHandler);
					webSocketMessageHandler = null;
				}
				
				// Clean up ringing audio
				if (ringingAudio) {
					ringingAudio.stop();
					ringingAudio = null;
				}
				
				// Clean up call timer
				stopCallTimer();
				
				// Save call to history
				try {
					if (__callDirection === "outgoing") {
						const num =
							document.getElementById("callNumber").value ||
							(currentSession &&
								currentSession.request &&
								currentSession.request.to &&
								currentSession.request.to.uri &&
								currentSession.request.to.uri.user) ||
							"Unknown";
						Storage.addCallToHistory(
							"outgoing",
							num,
							document.getElementById("callDuration")
								.textContent || "00:00",
						);
					} else if (__callDirection === "incoming") {
						const num =
							__incomingRaw && __incomingRaw !== "Unknown"
								? __incomingRaw
								: __incomingDisplay || "Unknown";
						Storage.addCallToHistory(
							"incoming",
							num,
							document.getElementById("callDuration")
								.textContent || "00:00",
						);
					}
				} catch (e) {
					console.error("Failed to save call history:", e);
				}

				currentSession = null;
				__callDirection = null;
				__answeredIncoming = false;
				hideCallControls();
				stopRinging();
				isMuted = false;
				document.getElementById("muteBtn").textContent = "Mute";
				document.getElementById("callStatus").textContent =
					"Call in progress";
				document.getElementById("callNumber").placeholder =
					"Enter number to dial / DTMF during call";
			}

			function startCallTimer() {
				callStartTime = Date.now();
				callTimer = setInterval(updateCallDuration, 1000);
			}

			function stopCallTimer() {
				if (callTimer) {
					clearInterval(callTimer);
					callTimer = null;
				}
				document.getElementById("callDuration").textContent = "00:00";
			}

			function updateCallDuration() {
				if (!callStartTime) {
					return;
				}

				const duration = Math.floor(
					(Date.now() - callStartTime) / 1000,
				);
				const minutes = Math.floor(duration / 60);
				const seconds = duration % 60;

				document.getElementById("callDuration").textContent =
					`${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
			}

			function appendNumber(num) {
				const input = document.getElementById("callNumber");

				if (currentSession) {
					const isEstablished =
						currentSession.dialog ||
						(currentSession.sessionDescriptionHandler &&
							currentSession.sessionDescriptionHandler
								.peerConnection);

					if (isEstablished) {
						if (sendDTMF(num)) {
							input.value = input.value + num;
						}
						return;
					}
				}

				input.value = input.value + num;
			}

			function clearNumber() {
				document.getElementById("callNumber").value = "";
			}

			function sendDTMF(digit) {
				if (!currentSession && !__answeredIncoming) {
					log("No active session for DTMF");
					return false;
				}

				const isEstablished =
					currentSession.dialog ||
					(currentSession.sessionDescriptionHandler &&
						currentSession.sessionDescriptionHandler
							.peerConnection);

				if (!isEstablished) {
					log("Call not fully established for DTMF");
					return false;
				}

				try {
					const options = {
						duration: DTMF_DURATION_MS,
						interToneGap: DTMF_INTERTONE_GAP_MS,
					};

					currentSession.dtmf(digit, options);
					log(`DTMF sent: ${digit} (${DTMF_DURATION_MS}ms duration)`);

					return true;
				} catch (error) {
					log(`DTMF failed: ${error.message}`);
					console.error("DTMF error:", error);
					return false;
				}
			}

			// View management
			function setView(view) {
				const sections = {
					call: document.getElementById("callSection"),
					config: document.getElementById("configSection"),
					log: document.getElementById("logSection"),
					history: document.getElementById("historySection"),
				};

				// Hide all sections
				Object.values(sections).forEach((section) => {
					if (section) {
						section.classList.remove("visible");
						section.classList.add("hidden");
					}
				});

				// Show requested view
				if (view === "phone") {
					sections.call.classList.remove("hidden");
					sections.call.classList.add("visible");
				} else if (view === "settings") {
					sections.config.classList.add("visible");
					sections.config.classList.remove("hidden");
				} else if (view === "log") {
					sections.log.classList.add("visible");
					sections.log.classList.remove("hidden");
				} else if (view === "history") {
					sections.history.classList.add("visible");
					sections.history.classList.remove("hidden");
					renderCallHistory();
				}

				// Update header buttons
				document
					.querySelectorAll(".header-toggle")
					.forEach((btn) => btn.classList.remove("active"));
				const activeBtn = document.querySelector(
					`.header-toggle[title="${view === "phone" ? "Phone" : view === "settings" ? "Settings" : view === "log" ? "Event Log" : "Call History"}"]`,
				);
				if (activeBtn) activeBtn.classList.add("active");
			}

			window.showPhone = () => setView("phone");
			window.showSettings = () => setView("settings");
			window.showLog = () => setView("log");
			window.showHistory = () => setView("history");

			// Call history functions
			async function renderCallHistory() {
				const el = document.getElementById("callHistory");
				if (!el) return;

				const history = await Storage.getHistory();

				if (history.length === 0) {
					el.innerHTML = `
						<div class="contact-item" style="text-align: center; padding: 20px; color: #666;">
							<p style="font-size: 14px;">No call history yet</p>
						</div>
					`;
					return;
				}

				el.innerHTML = '';
				history.forEach((item, index) => {
					let icon = "❓"; // Default for unknown
					let callType = "Unknown";

					if (item.type === "incoming") {
						icon = "⬇️"; // Incoming answered call
						callType = "Incoming";
					} else if (item.type === "outgoing") {
						icon = "⬆️"; // Outgoing call
						callType = "Outgoing";
					} else if (item.type === "missed") {
						icon = "🔴"; // Missed call (rang but not answered)
						callType = "Missed";
					} else if (item.type === "declined") {
						icon = "⛔"; // Declined call (explicitly rejected)
						callType = "Declined";
					}

					// Format phone number consistently
					let displayNumber = item.number;
					const cleanNumber = item.number.replace(/\D/g, '');
					
					if (cleanNumber.length === 10) {
						// US format: (555) 123-4567
						displayNumber = `(${cleanNumber.slice(0,3)}) ${cleanNumber.slice(3,6)}-${cleanNumber.slice(6)}`;
					} else if (cleanNumber.length === 11 && cleanNumber.startsWith('1')) {
						// 11 digits starting with 1: show as 10-digit format (555) 123-4567
						displayNumber = `(${cleanNumber.slice(1,4)}) ${cleanNumber.slice(4,7)}-${cleanNumber.slice(7)}`;
					} else if (cleanNumber.length === 7) {
						// Local format: 123-4567
						displayNumber = `${cleanNumber.slice(0,3)}-${cleanNumber.slice(3)}`;
					} else if (cleanNumber.length > 11) {
						// International format: +XX XXX XXX XXXX
						const countryCode = cleanNumber.slice(0, cleanNumber.length - 10);
						const areaCode = cleanNumber.slice(cleanNumber.length - 10, cleanNumber.length - 7);
						const firstPart = cleanNumber.slice(cleanNumber.length - 7, cleanNumber.length - 4);
						const lastPart = cleanNumber.slice(cleanNumber.length - 4);
						displayNumber = `+${countryCode} ${areaCode} ${firstPart} ${lastPart}`;
					}

					const timestamp = new Date(item.timestamp).toLocaleString();
					const safeNumber = cleanNumber.replace(/'/g, "\\'").replace(/"/g, '\\"');
					
					const historyDiv = document.createElement('div');
					historyDiv.className = 'contact-item';
					historyDiv.style.cssText = `
						padding: 16px 20px;
						border-bottom: 1px solid #f0f0f0;
						cursor: pointer;
						transition: all 0.2s ease;
						background: white;
					`;
					
					// Create the history display HTML
					const historyHTML = `
						<div style="padding: 6px 0;">
							<div style="display: flex; align-items: center; gap: 12px; margin-bottom: 4px;">
								<span style="font-size: 18px;">${icon}</span>
								<div style="flex: 1;">
									<button onclick="redial('${safeNumber}')" 
										style="background: none; border: none; color: #007bff; text-decoration: underline; cursor: pointer; font-family: monospace; font-size: 12px; padding: 0; text-align: left; font-weight: 600;">
										${displayNumber}
									</button>
									<div style="font-size: 10px; color: #888; text-transform: capitalize; margin-top: 2px;">
										${callType.toLowerCase()}
									</div>
								</div>
							</div>
							<div style="font-size: 10px; color: #666; margin-left: 30px;">
								${timestamp}
							</div>
						</div>
					`;
					
					historyDiv.innerHTML = historyHTML;
					
					historyDiv.addEventListener('mouseenter', () => {
						historyDiv.style.backgroundColor = '#f5f5f5';
					});
					historyDiv.addEventListener('mouseleave', () => {
						historyDiv.style.backgroundColor = 'transparent';
					});
					
					el.appendChild(historyDiv);
				});
			}

			async function clearHistory() {
				await Storage.clearHistory();
				renderCallHistory();
			}

			function redial(num) {
				try {
					document.getElementById("callNumber").value = (
						num || ""
					).replace(/[^0-9+]/g, "");
					setView("phone");
					if (isRegistered) {
						makeCall();
					}
				} catch (e) {
					console.error("Redial failed:", e);
				}
				return false;
			}

			// Clear all data
			async function clearAllData() {
				// Clear form fields
				[
					"username",
					"password",
					"displayName",
					"callerID",
					"callNumber",
				].forEach((id) => {
					const el = document.getElementById(id);
					if (el) el.value = "";
				});

				// Clear checkboxes
				[
					"saveCredentials",
					"hideCallerID",
					"registerOnStartup",
				].forEach((id) => {
					const el = document.getElementById(id);
					if (el) el.checked = false;
				});

				// Clear storage
				await Storage.clearAll();

				// Refresh call history display
				await renderCallHistory();
			}

			// Initialize on DOM load
			window.addEventListener("DOMContentLoaded", async function () {
				// Update page title with version
				document.title = `VoiceTel Phone v${APP_VERSION}`;
				
				// Set SIP server from configuration
				const sipServerEl = document.getElementById("sipServer");
				if (sipServerEl) {
					sipServerEl.value = SIP_SERVER;
				}
				
				// Update server info display
				const serverInfoEl = document.getElementById("serverInfo");
				if (serverInfoEl) {
					serverInfoEl.textContent = `WebSocket: ${SIP_SERVER} | SIP Domain: ${SIP_DOMAIN}`;
				}
				
				if (typeof SIP === "undefined") {
					console.error("SIP.js library failed to load");
					log("Error: SIP.js library not loaded");
					alert(
						"SIP.js library failed to load. Please check your internet connection and refresh.",
					);
					return;
				}

				log(`VoiceTel Phone v${APP_VERSION} ready`);
				log("Using local storage");
				log("SIP.js " + (SIP.version || "0.15.x") + " loaded");
				log(`Server: ${SIP_DOMAIN} (${SIP_SERVER})`);

				// Load saved configuration
				await Storage.loadConfig();

				// Setup input handlers
				document
					.getElementById("username")
					.addEventListener("input", function (e) {
						const value = e.target.value.replace(/\D/g, "");
						e.target.value = value.substring(0, USERNAME_LENGTH);

						const errorEl =
							document.getElementById("usernameError");
						if (value && value.length !== USERNAME_LENGTH) {
							errorEl.style.display = "block";
						} else {
							errorEl.style.display = "none";
						}
					});

				document
					.getElementById("callerID")
					.addEventListener("input", function (e) {
						const value = e.target.value.replace(/\D/g, "");
						e.target.value = value.substring(0, USERNAME_LENGTH);

						const errorEl =
							document.getElementById("callerIDError");
						if (value && !validateNorthAmericanNumber(value)) {
							errorEl.style.display = "block";
						} else {
							errorEl.style.display = "none";
						}
					});

				// Auto-save on change
				[
					"username",
					"password",
					"displayName",
					"callerID",
					"hideCallerID",
					"saveCredentials",
					"registerOnStartup",
				].forEach((id) => {
					const el = document.getElementById(id);
					if (el) {
						el.addEventListener("change", () =>
							Storage.saveConfig(),
						);
					}
				});

				// Keyboard shortcuts for incoming calls
				document.addEventListener("keydown", function (e) {
					if (incomingSession) {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							answerCall();
						} else if (e.key === "Escape") {
							e.preventDefault();
							declineCall();
						}
					}
				});
			});

			// Cleanup function for proper resource management
			function cleanupAllResources() {
				// Stop ringing audio
				stopRinging();
				if (ringingAudio) {
					ringingAudio.stop();
					ringingAudio = null;
				}
				
				// Clear all timeouts
				if (incomingCallTimeout) {
					clearTimeout(incomingCallTimeout);
					incomingCallTimeout = null;
				}
				if (callTimer) {
					clearInterval(callTimer);
					callTimer = null;
				}
				
				// Clean up WebSocket event listeners
				if (userAgent && userAgent.transport && userAgent.transport.ws && webSocketMessageHandler) {
					userAgent.transport.ws.removeEventListener("message", webSocketMessageHandler);
					webSocketMessageHandler = null;
				}
				
				// Clean up SIP sessions
				if (incomingSession) {
					try {
						incomingSession.reject();
					} catch (e) {}
					incomingSession = null;
				}
				if (currentSession) {
					try {
						currentSession.bye();
					} catch (e) {}
					currentSession = null;
				}
				if (userAgent) {
					try {
						userAgent.stop();
					} catch (e) {}
					userAgent = null;
				}
				
				// Reset all state
				isRegistered = false;
				registeredUsername = null;
				__callDirection = null;
				__answeredIncoming = false;
				__incomingRaw = null;
				__incomingDisplay = null;
			}

			// Cleanup on window close
			window.addEventListener("beforeunload", () => {
				cleanupAllResources();
			});

			// Obfuscate support email
			(function(){
				const u = "support", d = "voicetel", t = "com";
				const a = u + "@" + d + "." + t;
				const el = document.getElementById("supportEmailPhone");
				if (el) {
					el.href = "mailto:" + a;
				}
			})();
