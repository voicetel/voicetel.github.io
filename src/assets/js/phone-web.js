// VoiceTel Phone web client — vendored verbatim from voicetel-phone-desktop v3.8.4
// (index.html inline renderer script). Do not edit here; re-vendor instead.
			// Define navigation functions immediately so they're available for onclick handlers
			window.showPhone = function () {
				if (typeof setView === "function") setView("phone");
			};
			window.showSettings = function () {
				if (typeof setView === "function") setView("settings");
			};
			window.showLog = function () {
				if (typeof setView === "function") setView("log");
			};
			window.showHistory = function () {
				if (typeof setView === "function") setView("history");
			};
			window.showContacts = function () {
				if (typeof setView === "function") setView("contacts");
			};

			// Google auth functions - placeholders, will be properly defined later
			window.signInWithGoogle = function () {};
			window.signOutGoogle = function () {};
			window.loadGoogleContacts = function () {};
			window.filterContacts = function () {};

			// Constants
			const INCOMING_CALL_TIMEOUT_MS = 30000;
			const DTMF_DURATION_MS = 250;
			const DTMF_INTERTONE_GAP_MS = 100;
			const SIP_REGISTRATION_EXPIRES_SEC = 180;
			// Stuck-registration backstop (H2): if neither 'registered' nor
			// 'registrationFailed' ever fires (the WS dies mid-flight), clear
			// registration state after this deadline so re-registration can
			// proceed instead of registrationPromise wedging forever.
			const SIP_REGISTRATION_TIMEOUT_MS = 30000;
			const USERNAME_LENGTH = 10;
			// Hold/resume re-INVITE settle backstop (matches the mobile twin's
			// window.HOLD_SETTLE_TIMEOUT_MS). If sip.js emits no settle event
			// (a getDescription reject leaves pendingReinvite stuck), reconcile.
			const HOLD_SETTLE_TIMEOUT_MS = 10000;
			// Keep the "Transfer completed" confirmation up briefly before the
			// call panel tears down (L13 / mobile TRANSFER_COMPLETED_MS).
			const TRANSFER_COMPLETED_MS = 2000;
			// Config is exposed by preload.js (contextBridge) before this
			// script runs — see main.js additionalArguments / preload.js.
			// NB: read into a DIFFERENTLY named const — a top-level `const
			// VOICETEL_CONFIG` would collide with the non-configurable global
			// that contextBridge defines and abort the whole inline script.
			const INJECTED_CONFIG = window.VOICETEL_CONFIG || {};
			const APP_VERSION = INJECTED_CONFIG.version || "3.8.4";
			// The carrier build registers against the fixed VoiceTel platform
			// endpoint (both overridable per-install via package.json config,
			// injected by the main process).
			const SIP_DOMAIN = INJECTED_CONFIG.sipDomain || "tls.voicetel.com";
			const SIP_SERVER =
				INJECTED_CONFIG.sipServer || "wss://tls.voicetel.com:443";

			// Username validation (10-digit account number).
			function isValidUsername(username) {
				return (
					username &&
					/^\d{10}$/.test(username) &&
					username.length === USERNAME_LENGTH
				);
			}

			function normalizeCallerId(input) {
				const raw = (input || "").trim();
				const hasPlus = raw.startsWith("+");
				const digits = raw.replace(/\D/g, "");
				if (!digits) return "";
				if (hasPlus) return "+" + digits;
				if (digits.length === 10) return "+1" + digits;
				return "+" + digits;
			}

			function isValidE164(input) {
				return /^\+[1-9]\d{7,14}$/.test(normalizeCallerId(input));
			}

			// Configure localforage
			localforage.config({
				name: "VoiceTel",
				storeName: "config",
			});

			// Simple Storage Manager
			const Storage = {
				CONFIG_KEY: "voicetel_config",
				HISTORY_KEY: "voicetel_history",

				// Persist the current settings form to local storage.
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
							registerOnStartup:
								document.getElementById("registerOnStartup")
									.checked,
							hideEventLog:
								document.getElementById("hideEventLog").checked,
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
						document.getElementById("registerOnStartup").checked =
							config.registerOnStartup || false;
						document.getElementById("hideEventLog").checked =
							config.hideEventLog || false;
						document.getElementById("saveCredentials").checked =
							config.saveCredentials || false;

						log("Configuration loaded from local storage");

						// Update event log visibility based on setting
						updateEventLogVisibility();

						// Auto-register if enabled
						if (
							config.registerOnStartup &&
							config.username &&
							config.password
						) {
							setTimeout(() => {
								log("Auto-registering...");
								// register() surfaces its own errors; swallow the
								// rejection so a failed auto-register isn't an
								// unhandled promise rejection.
								register().catch(() => {});
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
			let registeredDomain = null;
			let userAgent = null;
			let currentSession = null;
			let incomingSession = null;
			let incomingCallTimeout = null;
			let isRegistered = false;
			let isMuted = false;
			// Hold state + in-flight latch (D-2). sip.js 0.15.11 hold()/unhold()
			// settle via reinviteAccepted/reinviteFailed, so a tap is latched
			// until the re-INVITE resolves; see toggleHold()/settleHold().
			let isOnHold = false;
			let __holdInFlight = false;
			let __endCallInProgress = false;
			let __holdDesired = false;
			let __holdSettleTimer = null;
			// Wake lock + refreshed mic track (D-4)
			let wakeLock = null;
			let localAudioTrack = null;
			let callTimer = null;
			let callStartTime = null;
			let ringingAudio = null;

			// Registration management
			let registrationPromise = null; // Single registration promise to prevent concurrent registrations
			let unregistrationPromise = null; // Track unregistration in progress
			let reRegisterTimeout = null; // Debounce re-registration

			// Event listener cleanup tracking
			let activeEventListeners = new Set();
			let webSocketMessageHandler = null;

			// Call tracking for history
			let __callDirection = null;
			let __answeredIncoming = false;
			let __incomingRaw = null;
			let __incomingDisplay = null;
			let activeCall = false; // Global flag to track if there's an active call

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
				console.log(message); // mirror to devtools (L5)

				const logDiv = document.getElementById("log");
				if (!logDiv) return; // never throw if #log is missing (L4)

				const entry = document.createElement("div");
				entry.className = "log-entry";
				const timestamp = new Date().toLocaleTimeString();
				entry.textContent = `[${timestamp}] ${message}`;
				logDiv.insertBefore(entry, logDiv.firstChild);

				// Keep up to 500 entries (L5)
				while (logDiv.children.length > 500) {
					logDiv.removeChild(logDiv.lastChild);
				}

				// Persist so the log survives a reload (M9)
				try {
					const logs = [];
					for (let i = 0; i < Math.min(logDiv.children.length, 500); i++) {
						logs.push(logDiv.children[i].textContent);
					}
					localStorage.setItem("eventLog", JSON.stringify(logs));
				} catch (e) {
					console.error("Failed to persist log:", e);
				}
			}

			// Restore the event log from localStorage on startup (M9).
			function restoreEventLog() {
				try {
					const logDiv = document.getElementById("log");
					if (!logDiv) return;
					const stored = localStorage.getItem("eventLog");
					if (stored) {
						const logs = JSON.parse(stored);
						logDiv.innerHTML = "";
						logs.forEach((logText) => {
							const entry = document.createElement("div");
							entry.className = "log-entry";
							entry.textContent = logText;
							logDiv.appendChild(entry);
						});
					}
				} catch (e) {
					console.error("Failed to restore log:", e);
				}
			}

			function updateStatus(text, registered = false) {
				const statusEl = document.getElementById("status");
				if (!statusEl) return; // (L4)
				statusEl.textContent = text;
				if (registered) {
					statusEl.classList.add("registered");
				} else {
					statusEl.classList.remove("registered");
				}

				// Derive Register/Unregister/Call buttons from the badge (M7) so
				// no state path (rebuild, failure, timeout) can leave them stale.
				const registerBtn = document.getElementById("registerBtn");
				const unregisterBtn = document.getElementById("unregisterBtn");
				if (registerBtn) registerBtn.disabled = registered;
				if (unregisterBtn) unregisterBtn.disabled = !registered;
				// callBtn follows registration too, but never mid-call.
				if (!activeCall) {
					const callBtn = document.getElementById("callBtn");
					if (callBtn) callBtn.disabled = !registered;
				}
			}

			// Stable per-install SIP Contact user-part (M-P0-1, ported from the
			// device-verified mobile twin). sip.js 0.15 mints a new random Contact
			// user (and, with hackIpInContact:true, a new 192.0.2.x host) on every
			// UA rebuild; with no server-side Path/reg-id each is a NEW usrloc
			// binding, so a re-register orphans the binding an inbound call parked
			// against. Persisting one token per install (via localforage) and
			// pinning the host makes the Contact URI byte-identical across
			// rebuilds. Async; warmed at startup so stableContactUserSync() below
			// returns the persisted value by the time register() runs. The
			// reuse-vs-regenerate decision lives in RendererHelpers.chooseContactUser.
			// Persist a Contact token minted outside the async warm-up (the sync
			// accessor or the storage-error fallback). Fire-and-forget; a token
			// used but never stored is re-minted next launch, stranding one more
			// usrloc binding each time (M-P0-1 / M6). Mirrors mobile
			// persistContactToken.
			function persistContactToken(user) {
				try {
					const written = localforage.setItem("sip_contact_user", user);
					if (written && typeof written.catch === "function") {
						written.catch((error) => {
							log(
								`Stable contact user persist failed: ${error.message}`,
							);
						});
					}
				} catch (error) {
					log(`Stable contact user persist failed: ${error.message}`);
				}
			}

			async function getStableContactUser() {
				if (window.__sipContactUser) return window.__sipContactUser;
				try {
					const stored = await localforage.getItem("sip_contact_user");
					// Pass the memo as it stands NOW, after the await: the sync
					// accessor may have minted during the read (loadConfig schedules
					// auto-register on a 500 ms timer before this warm-up is
					// awaited), and that token is already in the Contact URI of a
					// REGISTER on the wire. resolveContactUser adopts it rather than
					// letting the stored value strand its binding.
					const { user, persist } = RendererHelpers.resolveContactUser({
						memo: window.__sipContactUser,
						stored,
					});
					// Fire-and-forget: awaiting the write here let a setItem
					// rejection throw past the assignment below into the catch,
					// which minted a SECOND, different token — one wasted usrloc
					// binding per occurrence.
					if (persist) {
						persistContactToken(user);
					}
					window.__sipContactUser = user;
					return user;
				} catch (error) {
					// Storage unavailable: fall back to a process-stable token (still
					// better than a fresh random Contact on every register this run).
					if (!window.__sipContactUser) {
						window.__sipContactUser =
							RendererHelpers.generateContactToken();
						persistContactToken(window.__sipContactUser);
					}
					log(`Stable contact user fallback: ${error.message}`);
					return window.__sipContactUser;
				}
			}

			// Synchronous accessor for register()'s Promise executor. Returns the
			// memoized (persisted) token; generates an in-memory one only if the
			// async warm-up has not run yet.
			function stableContactUserSync() {
				if (!window.__sipContactUser) {
					window.__sipContactUser =
						RendererHelpers.generateContactToken();
					persistContactToken(window.__sipContactUser);
				}
				return window.__sipContactUser;
			}

			// Stop a UA AND kill its transport's reconnect machinery (H1). sip.js
			// 0.15.11's Transport.disconnectPromise early-returns when the socket
			// is already CLOSED (the mid-reconnect state a dead-socket rebuild
			// finds) WITHOUT clearing reconnectTimer, so a plain ua.stop() leaves
			// the old transport's reconnect loop armed — it dials back later and
			// keeps a zombie WebSocket (+ CRLF keepalives) open forever. Every UA
			// teardown must go through here. Mirrors mobile disposeUserAgent.
			function disposeUserAgent(ua) {
				if (!ua) return;
				const transport = ua.transport;
				try {
					ua.stop();
				} catch (e) {
					log(`Error stopping userAgent: ${e.message}`);
				}
				if (!transport) return;
				try {
					if (transport.reconnectTimer) {
						clearTimeout(transport.reconnectTimer);
						transport.reconnectTimer = undefined;
					}
					// A disposed transport must never dial again.
					transport.reconnect = () => {};
					if (transport.ws && transport.ws.readyState <= 1) {
						transport.ws.close(1000);
					}
				} catch (e) {
					log(`Error disposing transport: ${e.message}`);
				}
			}

			// SIP Registration
			async function register() {
				// If already registering, return existing promise
				if (registrationPromise) {
					log("Registration already in progress, waiting...");
					return registrationPromise;
				}

				// If unregistering, wait for it to complete
				if (unregistrationPromise) {
					log("Waiting for unregistration to complete...");
					await unregistrationPromise;
				}

				// Create new promise for this registration attempt
				registrationPromise = new Promise((resolve, reject) => {
					if (typeof SIP === "undefined") {
						const error = new Error("SIP.js library not available");
						alert(
							"SIP.js library is not loaded. Please refresh the page.",
						);
						log("Error: SIP.js library not available");
						registrationPromise = null;
						reject(error);
						return;
					}

					const username = document.getElementById("username").value;
					const password = document.getElementById("password").value;
					const displayName = RendererHelpers.sanitizeCallingName(
						document.getElementById("displayName").value || username,
					);

					if (!username || !password) {
						const error = new Error("Missing required fields");
						alert("Please fill in all required fields");
						registrationPromise = null;
						reject(error);
						return;
					}

					if (!isValidUsername(username)) {
						const error = new Error("Invalid username format");
						alert("Username must be exactly 10 numeric digits");
						document.getElementById("usernameError").style.display =
							"block";
						registrationPromise = null;
						reject(error);
						return;
					}

					if (!RendererHelpers.isValidPassword(password)) {
						log(
							"⚠️ Password is not 10 alphanumerics — the server will reject if it disagrees",
						);
					}

					// Fixed carrier registrar (VoiceTel platform).
					const domain = SIP_DOMAIN;
					const server = SIP_SERVER;

					registeredUsername = username;
					registeredDomain = domain;

					try {
						log("Starting registration...");
						log(`Connecting to ${server} (domain ${domain})...`);

						const uri = `sip:${username}@${domain}`;

						// SIP.js 0.15 transport options (working reconnect option
						// names, not the silently-ignored wsServer* ones). See
						// lib/renderer-helpers.js buildTransportOptions().
						const transportOptions =
							RendererHelpers.buildTransportOptions(server);

						// Stable Contact identity across UA rebuilds. Read the
						// memoized (persisted at startup) token synchronously so
						// this executor stays synchronous for the in-progress guard.
						const contactUser = stableContactUserSync();

						const userAgentOptions = {
							uri: uri,
							transportOptions: transportOptions,
							authorizationUser: username,
							password: password,
							displayName: displayName,
							register: true,
							registerOptions: {
								registrar: `sip:${domain}`,
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
							// Stable Contact across UA rebuilds: contactName pins the
							// user-part (sip.js otherwise mints a random token per UA);
							// a fixed host string to hackIpInContact pins the host (its
							// boolean-true path randomizes 192.0.2.<1-254>). Together
							// the Contact URI is byte-identical every register, so a
							// re-register refreshes one usrloc binding. Ported from the
							// device-verified mobile twin (M-P0-1).
							contactName: contactUser,
							hackIpInContact: RendererHelpers.STABLE_CONTACT_HOST,
							dtmfType: "rtp",
							userAgentString: `VoiceTel/${APP_VERSION}`,
						};

						// Stop any existing UA before creating a new one (e.g.
						// re-registering while already registered) so it is not
						// orphaned with a live WSS connection and stale event
						// handlers still mutating shared state.
						if (userAgent) {
							disposeUserAgent(userAgent);
							userAgent = null;
						}

						// Stuck-registration backstop state (H2): the timer armed
						// after start() only fires if neither one-time handler
						// settles the attempt first.
						let registrationSettled = false;
						let registrationTimeoutId = null;
						const finishRegistration = () => {
							registrationSettled = true;
							if (registrationTimeoutId) {
								clearTimeout(registrationTimeoutId);
								registrationTimeoutId = null;
							}
						};

						userAgent = new SIP.UA(userAgentOptions);

						// Use .once() for one-time event handlers
						userAgent.once("registered", () => {
							finishRegistration();
							isRegistered = true;
							updateStatus("Registered", true);
							log("Successfully registered");
							log("SIP/2.0 200 OK");

							document.getElementById("registerBtn").disabled =
								true;
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

							// Clear promise and resolve
							registrationPromise = null;
							resolve();
						});

						userAgent.once(
							"registrationFailed",
							(response, cause) => {
								finishRegistration();
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

								// Dispose the failed UA (H1) so its reconnect loop
								// can't resurrect stale state.
								if (userAgent) {
									disposeUserAgent(userAgent);
									userAgent = null;
								}

								// Clear promise and reject
								const error = new Error(
									cause || "Registration failed",
								);
								registrationPromise = null;
								reject(error);
							},
						);

						// Keep these as .on() for ongoing events
						userAgent.on("unregistered", (response, cause) => {
							// Log the truth (L9): the old hardcoded "200 OK
							// (Unregistered)" made a Wi-Fi flap read as a clean
							// server-confirmed unregister and misdirected support.
							log(
								cause
									? `Unregistered (${cause})`
									: "Unregistered (server confirmed)",
							);
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
									requireInteraction: true,
								});
							}

							handleIncomingCall(session);
						});

						userAgent.start();

						// Arm the stuck-registration backstop (H2). Only acts if
						// neither one-time handler has settled by the deadline.
						registrationTimeoutId = setTimeout(() => {
							registrationTimeoutId = null;
							if (registrationSettled) return;
							log(
								"Registration timed out with no server response — clearing state so re-registration can proceed",
							);
							registrationPromise = null;
							isRegistered = false;
							updateStatus("Registration Failed");
							if (userAgent) {
								disposeUserAgent(userAgent);
								userAgent = null;
							}
							reject(new Error("Registration timed out"));
						}, SIP_REGISTRATION_TIMEOUT_MS);
					} catch (error) {
						log(`Registration failed: ${error.message}`);
						updateStatus("Registration Failed");
						console.error(error);
						registrationPromise = null;
						reject(error);
					}
				});

				return registrationPromise;
			}

			async function unregister() {
				// If already unregistering, return the existing promise
				if (unregistrationPromise) {
					log("Unregistration already in progress, waiting...");
					return unregistrationPromise;
				}

				// If registering, wait for it to complete first
				if (registrationPromise) {
					log(
						"Waiting for registration to complete before unregistering...",
					);
					try {
						await registrationPromise;
					} catch (e) {
						// Ignore registration errors, proceed with unregister
					}
				}

				const p = (async () => {
					try {
						// Clean up WebSocket event listeners
						if (
							userAgent &&
							userAgent.transport &&
							userAgent.transport.ws &&
							webSocketMessageHandler
						) {
							userAgent.transport.ws.removeEventListener(
								"message",
								webSocketMessageHandler,
							);
							webSocketMessageHandler = null;
						}

						if (userAgent) {
							userAgent.unregister();
							disposeUserAgent(userAgent);
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
						throw error;
					}
				})();

				unregistrationPromise = p;
				// Clear in a microtask (M4): the old code set unregistrationPromise
				// = null INSIDE the executor, which ran before the outer assignment,
				// so the guard short-circuited every later call and unregister
				// silently no-opped after the first use.
				p.then(
					() => {
						unregistrationPromise = null;
					},
					() => {
						unregistrationPromise = null;
					},
				);

				return p;
			}

			// Re-registration with debouncing
			async function reRegister() {
				// Clear any pending re-registration
				if (reRegisterTimeout) {
					clearTimeout(reRegisterTimeout);
					reRegisterTimeout = null;
				}

				// Check if there's an active call or incoming session
				if (currentSession || incomingSession) {
					log("Cannot re-register during active call");
					return;
				}

				// Debounce: wait 500ms before executing
				reRegisterTimeout = setTimeout(() => {
					executeReRegister();
				}, 500);
			}

			async function executeReRegister() {
				try {
					// Check if we're actually registered
					if (!isRegistered || !userAgent) {
						log("Not currently registered, skipping re-register");
						return;
					}

					// Check WebSocket state - if connection is active, no need to re-register
					if (
						userAgent &&
						userAgent.transport &&
						userAgent.transport.ws
					) {
						const ws = userAgent.transport.ws;
						if (ws.readyState === WebSocket.OPEN) {
							log("WebSocket connection is active, registration is valid - no re-registration needed");
							return;
						} else {
							log(
								`WebSocket not open (state: ${ws.readyState}), re-registering...`,
							);
						}
					} else {
						log("WebSocket transport not available, re-registering...");
					}

					// Only re-register if WebSocket is not open
					log("Executing re-registration...");
					await unregister();
					await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
					await register();
					log("Re-registration completed successfully");
				} catch (error) {
					log(`Re-registration failed: ${error.message}`);
					console.error("Re-registration error:", error);
				}
			}

			// Setup app state listeners for visibility changes
			function setupAppStateListeners() {
				// Listen for visibility changes (app coming to foreground)
				document.addEventListener("visibilitychange", () => {
					if (!document.hidden) {
						log("App became visible");
						
						// If there's an incoming call, show the phone view and incoming call UI
						if (incomingSession) {
							setView("phone");
							document.getElementById("incomingCall").classList.add("active");
							log("Incoming call detected - showing incoming call UI");
						}
						// If there's an active call, ensure UI is shown
						else if (currentSession && activeCall) {
							showCallControls();
							log("Active call detected - call controls restored");
						}
						
						// Re-register if needed (but not during active or incoming call)
						if (isRegistered) {
							reRegister();
						}
					}
				});

				// Listen for window focus
				window.addEventListener("focus", () => {
					log("Window gained focus");
					
					// If there's an incoming call, show the phone view and incoming call UI
					if (incomingSession) {
						setView("phone");
						document.getElementById("incomingCall").classList.add("active");
						log("Incoming call detected - showing incoming call UI");
					}
					// If there's an active call, ensure UI is shown
					else if (currentSession && activeCall) {
						showCallControls();
						log("Active call detected - call controls restored");
					}
					
					// Re-register if needed (but not during active or incoming call)
					if (isRegistered) {
						reRegister();
					}
				});
			}

			// Setup WebSocket monitoring
			function setupWebSocketMonitoring() {
				setInterval(() => {
					// M1: act whenever we believe we are registered — a socket that
					// dies AFTER registration (registrationPromise already null) was
					// never noticed by the old CLOSED-&&-registrationPromise guard.
					if (userAgent && isRegistered) {
						if (
							userAgent.transport &&
							userAgent.transport.ws &&
							(userAgent.transport.ws.readyState ===
								WebSocket.CLOSED ||
								userAgent.transport.ws.readyState ===
									WebSocket.CLOSING)
						) {
							log(
								"WebSocket connection lost — will re-register on next foreground",
							);
							isRegistered = false;
							registrationPromise = null;
						}
					}
				}, 5000); // Check every 5 seconds
			}

			// Format phone number for display
			function formatPhoneNumber(number) {
				if (!number) return "";
				const cleanNumber = String(number).replace(/\D/g, "");

				if (cleanNumber.length === 10) {
					// US format: (555) 123-4567
					return `(${cleanNumber.slice(0, 3)}) ${cleanNumber.slice(3, 6)}-${cleanNumber.slice(6)}`;
				} else if (cleanNumber.length === 11 && cleanNumber.startsWith("1")) {
					// 11 digits starting with 1: show as 10-digit format (555) 123-4567
					return `(${cleanNumber.slice(1, 4)}) ${cleanNumber.slice(4, 7)}-${cleanNumber.slice(7)}`;
				} else if (cleanNumber.length === 7) {
					// Local format: 123-4567
					return `${cleanNumber.slice(0, 3)}-${cleanNumber.slice(3)}`;
				} else if (cleanNumber.length > 11) {
					// International format: +XX XXX XXX XXXX
					const countryCode = cleanNumber.slice(0, cleanNumber.length - 10);
					const areaCode = cleanNumber.slice(cleanNumber.length - 10, cleanNumber.length - 7);
					const firstPart = cleanNumber.slice(cleanNumber.length - 7, cleanNumber.length - 4);
					const lastPart = cleanNumber.slice(cleanNumber.length - 4);
					return `+${countryCode} ${areaCode} ${firstPart} ${lastPart}`;
				}

				return number; // Return as-is if format not recognized
			}

			// Google Contacts Integration
			let googleAccessToken = null;
			let googleContacts = [];
			let currentGoogleEmail = null; // Store the current signed-in email
			const CONTACTS_CACHE_KEY = "google_contacts_cache";
			const CONTACTS_CACHE_EMAIL_KEY = "google_contacts_cache_email";

			async function initGoogleAuth() {
				// Check if we have a saved token (use localforage, same as sign-in)
				const savedToken = await localforage.getItem("google_access_token");
				if (savedToken) {
					googleAccessToken = savedToken;
					log("Google: Using saved access token");
					try {
						await fetchUserEmail();
						updateAuthUI(true);
						
						// Try to load cached contacts first
						await loadCachedContacts();
						
						// Only fetch from API if no cached contacts or account changed
						if (googleContacts.length === 0) {
							await loadGoogleContacts(true); // true = save to cache
						} else {
							log(`Loaded ${googleContacts.length} cached contacts`);
							renderContacts(googleContacts);
						}
					} catch (error) {
						log(
							`Google: Failed to load contacts: ${error.message}`,
						);
						// Token might be expired, clear it
						await localforage.removeItem("google_access_token");
						localStorage.removeItem("google_access_token"); // Also clear from localStorage for cleanup
						googleAccessToken = null;
					}
				}
			}

			async function loadCachedContacts() {
				try {
					const cachedEmail = await localforage.getItem(CONTACTS_CACHE_EMAIL_KEY);
					const cachedContacts = await localforage.getItem(CONTACTS_CACHE_KEY);
					
					// Only use cached contacts if they match the current account
					if (cachedContacts && cachedEmail === currentGoogleEmail) {
						googleContacts = cachedContacts;
						log(`Found cached contacts for ${currentGoogleEmail}`);
						return true;
					} else if (cachedContacts && cachedEmail !== currentGoogleEmail) {
						// Different account, clear old cache
						log("Account changed, clearing old contact cache");
						await localforage.removeItem(CONTACTS_CACHE_KEY);
						await localforage.removeItem(CONTACTS_CACHE_EMAIL_KEY);
						googleContacts = [];
						return false;
					}
					return false;
				} catch (error) {
					log(`Failed to load cached contacts: ${error.message}`);
					return false;
				}
			}

			window.signInWithGoogle = async function () {
				try {
					// Clear any existing token and cached contacts before signing in
					// This ensures we get a fresh token for the selected account
					await localforage.removeItem("google_access_token");
					localStorage.removeItem("google_access_token");
					await localforage.removeItem(CONTACTS_CACHE_KEY);
					await localforage.removeItem(CONTACTS_CACHE_EMAIL_KEY);
					googleAccessToken = null;
					googleContacts = [];
					currentGoogleEmail = null;
					
					const CLIENT_ID =
						"1095726571445-nui2mdnita803bfs2qoslhbtf749jcfc.apps.googleusercontent.com";
					const REDIRECT_URI = "http://localhost:3000/oauth2callback";
					// Need both contacts.readonly and userinfo.email to get contacts and verify account
					const SCOPE =
						"https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/userinfo.email";

					const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams(
						{
							client_id: CLIENT_ID,
							redirect_uri: REDIRECT_URI,
							response_type: "token",
							scope: SCOPE,
							prompt: "select_account", // Force account selection without re-consent
						},
					)}`;

					log("Opening Google sign-in window...");
					log("Cleared previous token to ensure fresh account selection");

					// Use Electron's IPC to open OAuth window
					if (
						window.electronAPI &&
						window.electronAPI.openOAuthWindow
					) {
						try {
						const token =
							await window.electronAPI.openOAuthWindow(authUrl);
						if (token) {
							googleAccessToken = token;
							await localforage.setItem(
								"google_access_token",
								token,
							);
								
								// Verify which account this token belongs to
								await fetchUserEmail();
								
								if (currentGoogleEmail) {
									log(`Google: Successfully signed in as ${currentGoogleEmail}`);
							updateAuthUI(true);
									
									// Check if we have cached contacts for this account
									await loadCachedContacts();
									
									// Always fetch fresh contacts after sign-in to ensure we have the latest
									await loadGoogleContacts(true); // true = save to cache
								} else {
									log("Google: Signed in but failed to verify account email");
									updateAuthUI(true); // Still show as signed in
									await loadGoogleContacts(true);
								}
						} else {
							log("Google: Sign-in cancelled or failed");
							}
						} catch (oauthError) {
							// Handle OAuth-specific errors with user-friendly messages
							const errorMessage = oauthError.message || oauthError.toString();
							log(`Google sign-in error: ${errorMessage}`);
							
							// Show alert for access denied errors
							if (errorMessage.includes("access_denied") || errorMessage.includes("Access denied")) {
								alert(
									"Access Denied\n\n" +
									"This app is currently in testing mode and hasn't been verified by Google.\n\n" +
									"To gain access:\n" +
									"1. Contact support@voicetel.com to request access\n" +
									"2. Or ask the developer to add your Google account to the test users list\n\n" +
									"Error: " + errorMessage
								);
							} else {
								alert(`Google sign-in failed: ${errorMessage}`);
							}
							console.error("Google sign-in error:", oauthError);
						}
					} else {
						log("Google: OAuth window API not available");
					}
				} catch (error) {
					log(`Google sign-in error: ${error.message}`);
					console.error("Google sign-in error:", error);
					alert(`Google sign-in error: ${error.message}`);
				}
			};

			async function fetchUserEmail() {
				if (!googleAccessToken) {
					return;
				}

				try {
					const response = await fetch(
						"https://people.googleapis.com/v1/people/me?personFields=emailAddresses",
						{
							headers: {
								Authorization: `Bearer ${googleAccessToken}`,
							},
						},
					);

					if (response.ok) {
						const data = await response.json();
						const email =
							data.emailAddresses?.[0]?.value || "Unknown";
						currentGoogleEmail = email; // Store email in variable
						document.getElementById("userEmail").textContent =
							`Signed in as: ${email}`;
						log(`Google: Signed in as ${email}`);
					}
				} catch (error) {
					log(`Failed to fetch user email: ${error.message}`);
					// Don't fail the sign-in process if email fetch fails
					document.getElementById("userEmail").textContent =
						"Signed in";
				}
			}

			window.loadGoogleContacts = async function (saveToCache = false) {
				if (!googleAccessToken) {
					log("Google: No access token available");
					return;
				}

				try {
					// First verify which account we're using
					const userEmail = currentGoogleEmail || document.getElementById("userEmail")?.textContent || "Unknown account";
					log(`Loading Google contacts for: ${userEmail}`);
					log("Using access token to fetch contacts from people/me/connections...");

					const response = await fetch(
						"https://people.googleapis.com/v1/people/me/connections?personFields=names,phoneNumbers&pageSize=1000",
						{
							headers: {
								Authorization: `Bearer ${googleAccessToken}`,
							},
						},
					);

					if (!response.ok) {
						throw new Error(
							`HTTP ${response.status}: ${response.statusText}`,
						);
					}

					const data = await response.json();

					if (data.connections) {
						googleContacts = data.connections
							.filter(
								(person) =>
									person.phoneNumbers &&
									person.phoneNumbers.length > 0,
							)
							.map((person) => ({
								name:
									person.names?.[0]?.displayName || "Unknown",
								phoneNumbers: person.phoneNumbers.map(
									(phone) => ({
										number: phone.value,
										type: phone.type || "other",
									}),
								),
							}));

						log(
							`Loaded ${googleContacts.length} contacts from Google for ${userEmail}`,
						);
						
						// Save to cache if requested (e.g., after sign-in or manual refresh)
						if (saveToCache && currentGoogleEmail) {
							await localforage.setItem(CONTACTS_CACHE_KEY, googleContacts);
							await localforage.setItem(CONTACTS_CACHE_EMAIL_KEY, currentGoogleEmail);
							log("Contacts cached locally");
						}
						
						renderContacts(googleContacts);
					} else {
						log(`No contacts found for ${userEmail}`);
					}
				} catch (error) {
					log(`Failed to load Google contacts: ${error.message}`);
					console.error("Load contacts error:", error);

					// If unauthorized, clear token
					if (error.message.includes("401")) {
						log("Token expired or invalid - please sign in again");
						await localforage.removeItem("google_access_token");
						localStorage.removeItem("google_access_token"); // Also clear from localStorage for cleanup
						googleAccessToken = null;
						currentGoogleEmail = null;
						updateAuthUI(false);
					}
				}
			};

			function renderContacts(contacts) {
				const contactsList = document.getElementById("contactsList");
				if (!contactsList) return;

				if (!contacts || contacts.length === 0) {
					contactsList.innerHTML =
						'<div style="text-align: center; padding: 20px; color: var(--text-soft);">No contacts found</div>';
					return;
				}

				// Sort contacts alphabetically
				const sortedContacts = [...contacts].sort((a, b) =>
					a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
				);

				contactsList.innerHTML = "";

				sortedContacts.forEach((contact) => {
					// Filter duplicate phone numbers
					const uniqueNumbers = [];
					const seenNumbers = new Set();

					contact.phoneNumbers.forEach((phoneObj) => {
						const cleaned = phoneObj.number.replace(/\D/g, "");
						if (!seenNumbers.has(cleaned) && cleaned.length > 0) {
							seenNumbers.add(cleaned);
							uniqueNumbers.push(phoneObj);
						}
					});

					// Skip contacts with no valid phone numbers
					if (uniqueNumbers.length === 0) return;

					// Create contact item container
					const contactDiv = document.createElement("div");
					contactDiv.className = "contact-item";
					contactDiv.style.cssText = `
						padding: 16px 20px;
						border-bottom: 1px solid var(--divider);
						cursor: pointer;
						transition: all 0.2s ease;
						background: var(--paper);
					`;

					// Create safe name for onclick handlers
					const safeName = contact.name
						.replace(/'/g, "\\'")
						.replace(/"/g, '\\"');

					// Build phone lines HTML
					let phoneLines = "";
					uniqueNumbers.forEach((phoneObj) => {
						const cleanNumber = phoneObj.number.replace(/\D/g, "");
						const displayNumber = formatPhoneNumber(
							phoneObj.number,
						);
						const phoneType = phoneObj.type
							? phoneObj.type
							: "Phone";
						const safePhone = cleanNumber
							.replace(/'/g, "\\'")
							.replace(/"/g, '\\"');

						phoneLines += `
							<div style="display: flex; align-items: center; justify-content: flex-start; gap: 8px; margin: 2px 0; padding: 3px 0;">
								<button onclick="event.stopPropagation(); redial('${safePhone}'); log('Selected: ${safePhone}');"
									style="background: none; border: none; color: var(--accent); text-decoration: underline; cursor: pointer; font-family: monospace; font-size: 12px; padding: 0; text-align: left;">
									${RendererHelpers.escapeHtml(displayNumber)}
								</button>
								<span style="font-size: 10px; color: var(--text-faint); text-transform: capitalize; min-width: 50px; text-align: left;">
									${RendererHelpers.escapeHtml(phoneType.toLowerCase())}
								</span>
							</div>
						`;
					});

					// Create the contact display HTML
					contactDiv.innerHTML = `
						<div style="padding: 6px 0;">
							<div style="font-weight: 600; font-size: 14px; color: var(--text-default); margin-bottom: 6px;">
								${RendererHelpers.escapeHtml(contact.name)}
							</div>
							${phoneLines}
						</div>
					`;

					// Add hover effects
					contactDiv.addEventListener("mouseenter", () => {
						contactDiv.style.backgroundColor = "var(--page-bg)";
					});
					contactDiv.addEventListener("mouseleave", () => {
						contactDiv.style.backgroundColor = "var(--paper)";
					});

					contactsList.appendChild(contactDiv);
				});
			}

			window.signOutGoogle = async function () {
				await localforage.removeItem("google_access_token");
				localStorage.removeItem("google_access_token"); // Also clear from localStorage for cleanup
				await localforage.removeItem(CONTACTS_CACHE_KEY);
				await localforage.removeItem(CONTACTS_CACHE_EMAIL_KEY);
				googleAccessToken = null;
				googleContacts = [];
				currentGoogleEmail = null; // Clear stored email
				log("Signed out from Google");

				// Clear contacts list
				const contactsList = document.getElementById("contactsList");
				if (contactsList) {
					contactsList.innerHTML = "";
				}

				// Update UI
				document.getElementById("notSignedIn").style.display = "block";
				document.getElementById("signedIn").style.display = "none";
			};

			function updateAuthUI(isSignedIn) {
				if (isSignedIn) {
					document.getElementById("notSignedIn").style.display =
						"none";
					document.getElementById("signedIn").style.display = "block";
				} else {
					document.getElementById("notSignedIn").style.display =
						"block";
					document.getElementById("signedIn").style.display = "none";
				}
			}

			window.filterContacts = function () {
				const query = document
					.getElementById("contactSearch")
					.value.toLowerCase();

				if (query === "") {
					renderContacts(googleContacts);
					return;
				}

				const filtered = googleContacts.filter((contact) => {
					// Search in contact name
					const nameMatch = contact.name
						.toLowerCase()
						.includes(query);
					
					// Search in phone numbers - check both formatted and raw numbers
					const phoneNumbers = contact.phoneNumbers || [];
					const phoneMatch = phoneNumbers.some((phoneObj) => {
						const phoneNumber = phoneObj.number || "";
						// Search in both the raw number and cleaned number
						const cleanNumber = phoneNumber.replace(/\D/g, "");
						return (
							phoneNumber.toLowerCase().includes(query) ||
							cleanNumber.includes(query)
						);
					});
					
					return nameMatch || phoneMatch;
				});

				renderContacts(filtered);
			};

			// Desktop version: loadContacts uses Google Contacts
			// This is called by the "Refresh Contacts" button - always fetch fresh
			window.loadContacts = async function () {
				await loadGoogleContacts(true); // true = save to cache after fetching
			};

			// Desktop version: clearContacts clears Google contacts
			window.clearContacts = function () {
				googleContacts = [];
				renderContacts(googleContacts);
				log("Contacts cleared");
			};

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

				const callerIDRaw = document
					.getElementById("callerID")
					.value.trim();
				if (callerIDRaw && !isValidE164(callerIDRaw)) {
					alert(
						"Please enter a valid Caller ID number (international E.164, or a 10-digit North American number)",
					);
					document.getElementById("callerIDError").style.display =
						"block";
					return;
				}
				document.getElementById("callerIDError").style.display = "none";

				try {
					const displayName = RendererHelpers.sanitizeCallingName(
						document.getElementById("displayName").value ||
							registeredUsername,
					);
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

					const identityUser = callerIDRaw
						? normalizeCallerId(callerIDRaw)
						: registeredUsername;
					const pAssertedIdentity = `"${displayName}" <sip:${identityUser}@${SIP_DOMAIN}>`;
					log(`Caller ID: ${displayName} ${identityUser}`);
					options.extraHeaders = [
						"P-Asserted-Identity: " + pAssertedIdentity,
					];

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
								if (
									userAgent.transport &&
									userAgent.transport.ws &&
									webSocketMessageHandler
								) {
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
								if (
									userAgent.transport &&
									userAgent.transport.ws &&
									webSocketMessageHandler
								) {
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

				const formattedNumber = formatPhoneNumber(callerUri) || callerUri;

				document.getElementById("incomingCallerName").textContent =
					callerName;
				document.getElementById("incomingCallerNumber").textContent =
					formattedNumber;
				__incomingDisplay = formattedNumber;

				document.getElementById("incomingCall").classList.add("active");
				hideDialpad();
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
				activeCall = true;

				hideIncomingCallUI();
				setupSessionHandlers(currentSession);
				try {
					currentSession.accept();
				} catch (e) {
					// A throwing accept() (InvalidState / SDP failure) must not leave
					// the UI stuck half-answered (M5 / mobile).
					log(`Answer failed: ${e.message}`);
					try {
						currentSession.terminate();
					} catch (e2) {
						// already gone
					}
					currentSession = null;
					__callDirection = null;
					__answeredIncoming = false;
					activeCall = false;
					endCall();
					return;
				}

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

				// Log as declined (this is correct for a manual press)
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
				showDialpad();
			}

			// Single-owner remote-audio attach (H3 / mobile attachRemoteAudio).
			// Several call-lifecycle events (accepted, trackAdded) reach here at
			// once; reassigning srcObject aborts an in-flight play() and can leave
			// the call silent. Only swap srcObject when the track set changed, and
			// guard overlapping play() with __playInFlight + a short retry.
			function attachRemoteAudio(pc, options) {
				const opts = options || {};
				const volume = typeof opts.volume === "number" ? opts.volume : 1.0;
				const remoteAudio = document.getElementById("remoteAudio");
				if (!remoteAudio || !pc) return false;

				const remoteStream = new MediaStream();
				pc.getReceivers().forEach((receiver) => {
					if (receiver.track) remoteStream.addTrack(receiver.track);
				});

				// Only swap srcObject when the track ids actually differ.
				const current = remoteAudio.srcObject;
				let sameTracks = false;
				if (current && typeof current.getTracks === "function") {
					const currentIds = current.getTracks().map((tr) => tr.id);
					const nextIds = remoteStream.getTracks().map((tr) => tr.id);
					sameTracks =
						currentIds.length === nextIds.length &&
						nextIds.every((id) => currentIds.includes(id));
				}
				if (!sameTracks) remoteAudio.srcObject = remoteStream;
				remoteAudio.volume = volume;

				// Skip a new play() while one is in flight (a second play() aborts
				// the first and the call stays silent); the in-flight chain retries.
				if (remoteAudio.__playInFlight) return true;
				const tryPlay = (retriesLeft) => {
					remoteAudio.__playInFlight = true;
					remoteAudio
						.play()
						.then(() => {
							remoteAudio.__playInFlight = false;
						})
						.catch((err) => {
							if (retriesLeft > 0) {
								setTimeout(() => tryPlay(retriesLeft - 1), 250);
							} else {
								remoteAudio.__playInFlight = false;
								log("Remote audio failed to play: " + err.message);
							}
						});
				};
				tryPlay(2);
				return true;
			}

			function setupSessionHandlers(session) {
				let ringingStarted = false;

				if (session.on) {
					// Hold/resume re-INVITE outcomes settle the optimistic hold
					// latch (D-2); sip.js 0.15.11 emits these. See toggleHold().
					// Being transferred (M3): follow the in-dialog REFER and adopt the
					// new call so the dying leg's BYE doesn't tear down the UI.
					session.on("referRequested", (referContext) => {
						log("Being transferred — following the REFER and adopting the call");
						let adopted = false;
						const adoptTargetSession = () => {
							if (adopted) return;
							const next = referContext.targetSession;
							if (!next) {
								log("Transfer follow: no target session to adopt");
								return;
							}
							adopted = true;
							currentSession = next;
							__callDirection = "outgoing";
							setupSessionHandlers(next);
							showCallControls();
							log("Adopted transferred call");
						};
						// sip.js emits referInviteSent synchronously from accept(), so the
						// listener must be attached BEFORE accept().
						referContext.on("referInviteSent", adoptTargetSession);
						try {
							referContext.accept({ followRefer: true });
						} catch (e) {
							log(`Transfer follow failed: ${e && e.message}`);
							return;
						}
						adoptTargetSession();
					});
					session.on("reinviteAccepted", () => settleHold(true));
					session.on("reinviteFailed", () => settleHold(false));
					session.on("renegotiationError", () => settleHold(false));
					// __callDirection is set before this runs in both makeCall and
					// answerCall, so the transfer button reflects the right state.
					updateTransferAvailability();

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
							currentSession.sessionDescriptionHandler
								.peerConnection
						) {
							const pc =
								currentSession.sessionDescriptionHandler
									.peerConnection;
							const remoteDesc = pc.remoteDescription;
							if (remoteDesc && remoteDesc.sdp) {
								if (
									remoteDesc.sdp.includes("telephone-event")
								) {
									log(
										"Remote supports RFC 2833 telephone-event",
									);
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

						if (ringingStarted) {
							stopRinging();
							ringingStarted = false;
						}
						activeCall = true;
						log("Call connected");

						startCallTimer();
						requestWakeLock();

						try {
							const pc =
								session.sessionDescriptionHandler
									.peerConnection;
							attachRemoteAudio(pc, { volume: 1.0 });

							// Backup remote-hangup detection (L10): if a SIP BYE never fires,
							// an ICE disconnect after the call was established ends the call.
							// Ported from mobile call-handler.js.
							let iceEstablished = false;
							const onIceChange = () => {
								const state = pc.iceConnectionState;
								log(`ICE connection state: ${state}`);
								if (state === "connected" || state === "completed") {
									iceEstablished = true;
								}
								if (
									iceEstablished &&
									(state === "disconnected" ||
										state === "failed" ||
										state === "closed")
								) {
									if (activeCall && currentSession === session) {
										pc.removeEventListener(
											"iceconnectionstatechange",
											onIceChange,
										);
										// Let a SIP BYE handler win if it fires first.
										setTimeout(() => {
											if (activeCall && currentSession === session) {
												log("ICE lost — ending call (backup detection)");
												endCall();
											}
										}, 500);
									}
								}
							};
							pc.addEventListener("iceconnectionstatechange", onIceChange);
							session.on("terminated", () => {
								pc.removeEventListener("iceconnectionstatechange", onIceChange);
							});
						} catch (e) {
							log("Error setting up audio: " + e.message);
						}
					});

					session.on("trackAdded", () => {
						try {
							const pc =
								session.sessionDescriptionHandler
									.peerConnection;
							attachRemoteAudio(pc, { volume: ringingStarted ? 0 : 1.0 });
						} catch (e) {
							log("Error handling track: " + e.message);
						}
					});
				}
			}

			function hangup() {
				stopRinging();
				// State-aware sequencing (terminate -> bye -> local teardown)
				// lives in lib/renderer-helpers.js runHangup(), ported from the
				// device-verified mobile twin. The old `hasAnswer ? bye() :
				// cancel()` called cancel() on an answered inbound session, which
				// throws and aborts the hangup. On the success path the session's
				// "terminated" handler cleans the UI exactly once; onTeardown
				// (endCall) only runs when no signaling was possible.
				if (currentSession) log("Hanging up...");
				RendererHelpers.runHangup(currentSession, {
					log,
					onTeardown: endCall,
				});
			}

			function toggleMute() {
				if (
					!currentSession ||
					!currentSession.sessionDescriptionHandler
				)
					return;

				const pc =
					currentSession.sessionDescriptionHandler.peerConnection;
				// Guard + flip + apply lives in lib/renderer-helpers.js
				// applyMuteToggle(): it guards a missing peer connection (the old
				// code derefed pc.getSenders() unguarded), flips the mute state,
				// and sets each audio track.enabled to !muted. changed=false means
				// no peer connection yet, so leave the UI state untouched.
				const result = RendererHelpers.applyMuteToggle(pc, isMuted);
				if (!result.changed) return;
				isMuted = result.muted;
				document.getElementById("muteBtn").textContent = isMuted
					? "Unmute"
					: "Mute";
				log(isMuted ? "Muted" : "Unmuted");
			}

			// Hold / resume (D-2, ported from mobile call-controls.js). The
			// in-flight-latch decision + desired-state math live in
			// lib/renderer-helpers.js planHoldToggle(); this owns the sip.js
			// hold()/unhold() call, the optimistic latch, and the DOM.
			function toggleHold() {
				if (
					!currentSession ||
					!currentSession.sessionDescriptionHandler
				)
					return;

				const plan = RendererHelpers.planHoldToggle({
					isOnHold,
					holdInFlight: __holdInFlight,
					pendingReinvite: currentSession.pendingReinvite,
				});
				if (!plan.proceed) {
					log("⏳ Hold/resume already in progress — ignoring");
					return;
				}

				const desiredHold = plan.desiredHold;
				log(
					desiredHold
						? "📞 Placing call on hold (re-INVITE)..."
						: "📞 Resuming call (re-INVITE)...",
				);

				// hold()/unhold() throw synchronously (InvalidStateError) on an
				// unconfirmed dialog; isOnHold is untouched until the re-INVITE is
				// on the wire, so a sync throw needs no revert.
				try {
					if (desiredHold) {
						currentSession.hold();
					} else {
						currentSession.unhold();
					}
				} catch (e) {
					log(
						`❌ Cannot ${desiredHold ? "hold" : "resume"} yet (status ${currentSession.status}): ${e.message}`,
					);
					return;
				}

				// Re-INVITE is on the wire: latch, set the intended state
				// optimistically, reflect it, and reconcile when sip.js settles.
				__holdInFlight = true;
				__holdDesired = desiredHold;
				isOnHold = desiredHold;
				applyHoldUiState();

				// Backstop for sip.js's pendingReinvite wedge: if nothing settles
				// in time, clear the stuck guard and revert.
				clearTimeout(__holdSettleTimer);
				__holdSettleTimer = setTimeout(() => {
					if (!__holdInFlight) return;
					log("⚠️ Hold re-INVITE did not settle in time — reverting");
					if (currentSession) currentSession.pendingReinvite = false;
					settleHold(false);
				}, HOLD_SETTLE_TIMEOUT_MS);
			}

			// Reflect isOnHold in the Hold button label and the mic track
			// (disabled while held; otherwise follows mute) via applyHoldToSenders.
			function applyHoldUiState() {
				const holdBtn = document.getElementById("holdBtn");
				if (holdBtn) holdBtn.textContent = isOnHold ? "Resume" : "Hold";
				const pc =
					currentSession &&
					currentSession.sessionDescriptionHandler &&
					currentSession.sessionDescriptionHandler.peerConnection;
				RendererHelpers.applyHoldToSenders(pc, isOnHold, isMuted);
			}

			// Reconcile app state once sip.js reports the hold/resume re-INVITE
			// outcome (reinviteAccepted -> success, reinviteFailed/
			// renegotiationError -> revert). Wired in setupSessionHandlers().
			function settleHold(success) {
				if (!__holdInFlight) return;
				__holdInFlight = false;
				clearTimeout(__holdSettleTimer);
				isOnHold = RendererHelpers.resolveHoldSettle(
					__holdDesired,
					success,
				);
				log(
					success
						? isOnHold
							? "✅ On hold"
							: "✅ Resumed"
						: "↩️ Hold/resume failed — reverted",
				);
				applyHoldUiState();
			}

			// Blind transfer (D-2, ported from mobile transferCall). Only a call we
			// ANSWERED (incoming) may be transferred; input normalization + the
			// guard live in lib/renderer-helpers.js.
			function transferCall() {
				if (
					!RendererHelpers.canTransfer(!!currentSession, __callDirection)
				) {
					log("Transfer is only available on calls you answered");
					return;
				}

				const number = RendererHelpers.normalizeTransferTarget(
					prompt("Transfer call to:"),
				);
				if (!number) return; // cancelled or no digits

				try {
					const target = RendererHelpers.buildTransferUri(
						number,
						SIP_DOMAIN,
					);
					// sip.js fires referAccepted on the NOTIFY sipfrag 2xx (transfer
					// PROVABLY succeeded), not on the 202 — so this hangup already
					// has wait-for-NOTIFY-200 semantics.
					const ctx = currentSession.refer(target);
					log(`Transferring call to ${number}...`);
					if (ctx && typeof ctx.on === "function") {
						ctx.on("referAccepted", () => {
							log(
								"Transfer succeeded (NOTIFY 200) — leaving the call",
							);
							document.getElementById("callStatus").textContent =
								"Transfer completed";
							// Keep the confirmation visible before teardown (L13).
							setTimeout(hangup, TRANSFER_COMPLETED_MS);
						});
						ctx.on("referRequestRejected", () => {
							log("Transfer rejected — staying in the call");
						});
						ctx.on("referRejected", () => {
							log(
								"Transfer failed at the target — staying in the call",
							);
						});
					}
				} catch (error) {
					log(`Transfer failed: ${error.message}`);
				}
			}

			// Transfer is offered ONLY on calls we ANSWERED (incoming). Disable +
			// dim the button otherwise; transferCall() re-checks so a stale-enabled
			// button cannot emit a REFER.
			function updateTransferAvailability() {
				const transferBtn = document.getElementById("transferBtn");
				if (!transferBtn) return;
				const ok = RendererHelpers.canTransfer(
					!!currentSession,
					__callDirection,
				);
				transferBtn.disabled = !ok;
				transferBtn.style.opacity = ok ? "" : "0.45";
			}

			// Wake lock (D-4, ported from mobile audio.js): keep the display awake
			// during an active call so OS screen-sleep can't tear down the media
			// session. Screen Wake Lock API (Chromium/Electron).
			async function requestWakeLock() {
				try {
					if ("wakeLock" in navigator) {
						wakeLock = await navigator.wakeLock.request("screen");
						log("Wake lock acquired — display stays on during the call");
						wakeLock.addEventListener("release", () => {
							log("Wake lock released");
						});
					} else {
						log("Wake lock API not supported");
					}
				} catch (error) {
					log("Wake lock failed: " + error.message);
				}
			}

			async function releaseWakeLock() {
				try {
					if (wakeLock) {
						await wakeLock.release();
						wakeLock = null;
					}
				} catch (error) {
					log("Error releasing wake lock: " + error.message);
				}
			}

			// Re-acquire the microphone and replace the live outbound track (D-4,
			// ported from mobile refreshMicrophoneTrack). On desktop this is the
			// manual equivalent of the mobile CallKit trigger — use it after
			// switching audio devices mid-call. Honors the current mute state so a
			// refreshed track never goes live "hot" while the UI shows muted.
			async function refreshMicrophoneTrack() {
				if (!currentSession || !activeCall) return false;
				try {
					const pc =
						currentSession.sessionDescriptionHandler &&
						currentSession.sessionDescriptionHandler.peerConnection;
					if (!pc) return false;
					const stream = await navigator.mediaDevices.getUserMedia(
						RendererHelpers.micCaptureConstraints(),
					);
					const audioTrack = stream.getAudioTracks()[0];
					if (!audioTrack) return false;
					const audioSender = RendererHelpers.selectAudioSender(pc);
					const enabled = !isMuted;
					if (audioSender) {
						if (localAudioTrack) localAudioTrack.stop();
						await audioSender.replaceTrack(audioTrack);
						audioTrack.enabled = enabled;
						localAudioTrack = audioTrack;
						log("🎙️ Microphone refreshed");
						return true;
					}
					audioTrack.enabled = enabled;
					pc.addTrack(audioTrack, stream);
					localAudioTrack = audioTrack;
					log("🎙️ Microphone track added");
					return true;
				} catch (e) {
					log("Microphone refresh failed: " + (e.message || e));
					return false;
				}
			}

			// In-call Dialpad button (mobile 3.8.4 parity): lives in the control
			// grid and toggles the keypad for DTMF. Visible only while a call is up
			// AND the call panel is showing; label follows the keypad state. The
			// visibility/label rule is RendererHelpers.inCallDialpadButtonState
			// (unit-tested); this only paints it.
			function paintInCallDialpadButton(padUp) {
				const showDialpadBtn =
					document.getElementById("showDialpadBtn");
				if (!showDialpadBtn) return;
				const callPanelUp = document
					.getElementById("callControls")
					.classList.contains("active");
				const state = RendererHelpers.inCallDialpadButtonState({
					padUp,
					inCall: !!currentSession && callPanelUp,
				});
				showDialpadBtn.style.display = state.visible ? "" : "none";
				showDialpadBtn.textContent = state.label;
			}

			function showDialpad() {
				const dialpadLayer = document.getElementById("dialpadLayer");
				if (dialpadLayer) {
					dialpadLayer.style.display = "block";
				}
				paintInCallDialpadButton(true);
			}

			function hideDialpad() {
				const dialpadLayer = document.getElementById("dialpadLayer");
				if (dialpadLayer) {
					dialpadLayer.style.display = "none";
				}
				paintInCallDialpadButton(false);
			}

			function toggleInCallDialpad() {
				const dialpadLayer = document.getElementById("dialpadLayer");
				const padUp = !!dialpadLayer && dialpadLayer.style.display !== "none";
				if (padUp) {
					hideDialpad();
				} else {
					showDialpad();
				}
			}

			// Function to update event log visibility based on setting
			function updateEventLogVisibility() {
				const hideEventLogElement =
					document.getElementById("hideEventLog");
				if (!hideEventLogElement) {
					return;
				}

				const hideEventLog = hideEventLogElement.checked;
				const logButton = document.querySelector(
					'.header-toggle[title="Event Log"]',
				);
				const logSection = document.getElementById("logSection");

				if (hideEventLog) {
					// Hide the event log button and section
					if (logButton) {
						logButton.style.display = "none";
					}
					if (logSection) {
						logSection.style.display = "none";
					}
				} else {
					// Show the event log button and section
					if (logButton) {
						logButton.style.display = "";
					}
					if (logSection) {
						logSection.style.display = "";
					}
				}
			}

			function showCallControls() {
				document.getElementById("callControls").classList.add("active");
				document.getElementById("callBtn").disabled = true;
				hideDialpad();
			}

			function hideCallControls() {
				document
					.getElementById("callControls")
					.classList.remove("active");
				document.getElementById("callBtn").disabled = false;
				showDialpad();
				stopCallTimer();
			}

			async function endCall() {
				// Prevent double teardown: bye + terminated (or failed/rejected) can
				// both fire endCall, which would write a duplicate call-history row
				// and repeat teardown (H4 / mobile).
				if (__endCallInProgress) {
					log("endCall already in progress, skipping duplicate");
					return;
				}
				__endCallInProgress = true;
				try {
				// Clean up WebSocket event listeners
				if (
					userAgent &&
					userAgent.transport &&
					userAgent.transport.ws &&
					webSocketMessageHandler
				) {
					userAgent.transport.ws.removeEventListener(
						"message",
						webSocketMessageHandler,
					);
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
				activeCall = false;
				hideCallControls();
				stopRinging();
				isMuted = false;
				document.getElementById("muteBtn").textContent = "Mute";
				// Reset hold state + latch (D-2)
				isOnHold = false;
				__holdInFlight = false;
				__holdDesired = false;
				clearTimeout(__holdSettleTimer);
				const holdBtnEl = document.getElementById("holdBtn");
				if (holdBtnEl) holdBtnEl.textContent = "Hold";
				updateTransferAvailability();
				// Release wake lock + stop the refreshed mic track (D-4)
				releaseWakeLock();
				if (localAudioTrack) {
					localAudioTrack.stop();
					localAudioTrack = null;
				}
				document.getElementById("callStatus").textContent =
					"Call in progress";
				document.getElementById("callNumber").placeholder =
					"Enter number to dial / DTMF during call";

				// Hide the in-call Dialpad button when the call ends
				const showDialpadBtn = document.getElementById("showDialpadBtn");
				if (showDialpadBtn) {
					showDialpadBtn.style.display = "none";
					showDialpadBtn.textContent = "Dialpad";
				}
				} finally {
					// Always release the latch, even if a teardown step throws — a
					// stuck flag would wedge every future endCall (H4 / mobile).
					__endCallInProgress = false;
				}
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

				// Dial-as-you-type formatting (D-3). makeCall() strips non-digits
				// before dialing, so the pretty value is display-only.
				input.value = RendererHelpers.formatDialAsYouType(
					input.value + num,
				);
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
					contacts: document.getElementById("contactsSection"),
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

				// Remove active class from all header buttons
				document.querySelectorAll(".header-toggle").forEach((btn) => {
					btn.classList.remove("active");
				});

				// Show requested view and activate corresponding button
				if (view === "phone") {
					sections.call.classList.remove("hidden");
					sections.call.classList.add("visible");
					document
						.querySelector('[onclick="showPhone()"]')
						?.classList.add("active");
					showDialpad();
				} else if (view === "settings") {
					sections.config.classList.add("visible");
					sections.config.classList.remove("hidden");
					document
						.querySelector('[onclick="showSettings()"]')
						?.classList.add("active");
				} else if (view === "contacts") {
					sections.contacts.classList.add("visible");
					sections.contacts.classList.remove("hidden");
					document
						.querySelector('[onclick="showContacts()"]')
						?.classList.add("active");
				} else if (view === "log") {
					sections.log.classList.add("visible");
					sections.log.classList.remove("hidden");
					document
						.querySelector('[onclick="showLog()"]')
						?.classList.add("active");
				} else if (view === "history") {
					sections.history.classList.add("visible");
					sections.history.classList.remove("hidden");
					document
						.querySelector('[onclick="showHistory()"]')
						?.classList.add("active");
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

			// Update navigation functions to use setView once it's defined
			window.showPhone = function () {
				setView("phone");
			};
			window.showContacts = function () {
				setView("contacts");
			};
			window.showSettings = function () {
				setView("settings");
			};
			window.showLog = function () {
				setView("log");
			};
			window.showHistory = function () {
				setView("history");
			};

			// Call history functions
			async function renderCallHistory() {
				const el = document.getElementById("callHistory");
				if (!el) return;

				const history = await Storage.getHistory();

				if (history.length === 0) {
					el.innerHTML = `
						<div class="contact-item" style="text-align: center; padding: 20px; color: var(--text-soft);">
							<p style="font-size: 14px;">No call history yet</p>
						</div>
					`;
					return;
				}

				el.innerHTML = "";
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
					const cleanNumber = item.number.replace(/\D/g, "");

					if (cleanNumber.length === 10) {
						// US format: (555) 123-4567
						displayNumber = `(${cleanNumber.slice(0, 3)}) ${cleanNumber.slice(3, 6)}-${cleanNumber.slice(6)}`;
					} else if (
						cleanNumber.length === 11 &&
						cleanNumber.startsWith("1")
					) {
						// 11 digits starting with 1: show as 10-digit format (555) 123-4567
						displayNumber = `(${cleanNumber.slice(1, 4)}) ${cleanNumber.slice(4, 7)}-${cleanNumber.slice(7)}`;
					} else if (cleanNumber.length === 7) {
						// Local format: 123-4567
						displayNumber = `${cleanNumber.slice(0, 3)}-${cleanNumber.slice(3)}`;
					} else if (cleanNumber.length > 11) {
						// International format: +XX XXX XXX XXXX
						const countryCode = cleanNumber.slice(
							0,
							cleanNumber.length - 10,
						);
						const areaCode = cleanNumber.slice(
							cleanNumber.length - 10,
							cleanNumber.length - 7,
						);
						const firstPart = cleanNumber.slice(
							cleanNumber.length - 7,
							cleanNumber.length - 4,
						);
						const lastPart = cleanNumber.slice(
							cleanNumber.length - 4,
						);
						displayNumber = `+${countryCode} ${areaCode} ${firstPart} ${lastPart}`;
					}

					const timestamp = new Date(item.timestamp).toLocaleString();
					const safeNumber = cleanNumber
						.replace(/'/g, "\\'")
						.replace(/"/g, '\\"');

					const historyDiv = document.createElement("div");
					historyDiv.className = "contact-item";
					historyDiv.style.cssText = `
						padding: 16px 20px;
						border-bottom: 1px solid var(--divider);
						cursor: pointer;
						transition: all 0.2s ease;
						background: var(--paper);
					`;

					const historyHTML = `
						<div style="padding: 6px 0;">
							<div style="display: flex; align-items: center; gap: 12px; margin-bottom: 4px;">
								<span style="font-size: 18px;">${icon}</span>
								<div style="flex: 1;">
									<button onclick="redial('${safeNumber}')"
										style="background: none; border: none; color: var(--accent); text-decoration: underline; cursor: pointer; font-family: monospace; font-size: 12px; padding: 0; text-align: left; font-weight: 600;">
										${RendererHelpers.escapeHtml(displayNumber)}
									</button>
									<div style="font-size: 10px; color: var(--text-faint); text-transform: capitalize; margin-top: 2px;">
										${callType.toLowerCase()}
									</div>
								</div>
							</div>
							<div style="font-size: 10px; color: var(--text-soft); margin-left: 30px;">
								${timestamp}
							</div>
						</div>
					`;

					historyDiv.innerHTML = historyHTML;

					historyDiv.addEventListener("mouseenter", () => {
						historyDiv.style.backgroundColor = "var(--page-bg)";
					});
					historyDiv.addEventListener("mouseleave", () => {
						historyDiv.style.backgroundColor = "transparent";
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
					"registerOnStartup",
					"hideEventLog",
				].forEach((id) => {
					const el = document.getElementById(id);
					if (el) el.checked = false;
				});

				// Update event log visibility after clearing
				updateEventLogVisibility();

				// Clear storage
				await Storage.clearAll();

				// Refresh call history display
				await renderCallHistory();
			}

			// Initialize on DOM load
			// Appearance / theme (D-5, ported from mobile theme.js). "system"
			// leaves data-theme off so prefers-color-scheme follows the OS;
			// light/dark set data-theme on <html>. Persisted so the head script
			// applies it before first paint. Normalize logic lives in lib.
			const THEME_STORAGE_KEY = "voicetel_theme";
			function getThemePref() {
				try {
					return RendererHelpers.normalizeThemePref(
						localStorage.getItem(THEME_STORAGE_KEY),
					);
				} catch {
					return "system";
				}
			}
			function applyTheme(pref) {
				const normalized = RendererHelpers.normalizeThemePref(pref);
				const root = document.documentElement;
				if (normalized === "system") {
					root.removeAttribute("data-theme");
				} else {
					root.setAttribute("data-theme", normalized);
				}
				try {
					if (normalized === "system") {
						localStorage.removeItem(THEME_STORAGE_KEY);
					} else {
						localStorage.setItem(THEME_STORAGE_KEY, normalized);
					}
				} catch {
					/* storage disabled — in-memory data-theme still holds */
				}
				return normalized;
			}
			function initThemeControl() {
				const sel = document.getElementById("themeSelect");
				if (!sel) return;
				sel.value = getThemePref();
				sel.addEventListener("change", () => {
					const applied = applyTheme(sel.value);
					log(`Appearance set to ${applied}`);
				});
			}

			window.addEventListener("DOMContentLoaded", async function () {
				// Update page title with version
				document.title = `VoiceTel Phone v${APP_VERSION}`;

				// Apply the saved appearance + wire the selector (D-5)
				initThemeControl();
				restoreEventLog(); // (M9/L8)

				// Populate the hidden sipServer field + server info display
				// (fixed carrier endpoint).
				const sipServerEl = document.getElementById("sipServer");
				if (sipServerEl) sipServerEl.value = SIP_SERVER;
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

				// Warm the persisted stable Contact user-part BEFORE loadConfig
				// so a config-driven auto-register uses the persisted value (L6).
				await getStableContactUser();

				// Load saved configuration
				await Storage.loadConfig();

				// Setup app state listeners and WebSocket monitoring
				setupAppStateListeners();
				setupWebSocketMonitoring();

				// Initialize Google Auth and try to load contacts
				initGoogleAuth();

				// Visibility backstop (L8): loadConfig's call is skipped on a
				// fresh install (no saved config), so ensure it runs once.
				setTimeout(() => updateEventLogVisibility(), 100);

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
						const hasPlus = e.target.value.trim().startsWith("+");
						const digits = e.target.value
							.replace(/\D/g, "")
							.substring(0, 15);
						e.target.value = (hasPlus ? "+" : "") + digits;

						const errorEl =
							document.getElementById("callerIDError");
						if (e.target.value && !isValidE164(e.target.value)) {
							errorEl.style.display = "block";
						} else {
							errorEl.style.display = "none";
						}
					});

				// Format the dial box as you type/paste (M8); mid-call the digits
				// are DTMF and handled by appendNumber, so skip then.
				document
					.getElementById("callNumber")
					.addEventListener("input", (e) => {
						if (currentSession && activeCall) return;
						e.target.value = RendererHelpers.formatDialAsYouType(
							e.target.value,
						);
					});

				// Auto-save on change
				[
					"username",
					"password",
					"displayName",
					"callerID",
					"saveCredentials",
					"registerOnStartup",
					"hideEventLog",
				].forEach((id) => {
					const el = document.getElementById(id);
					if (el) {
						el.addEventListener("change", () => {
							Storage.saveConfig();
							// Update event log visibility when hideEventLog changes
							if (id === "hideEventLog") {
								updateEventLogVisibility();
							}
						});
					}
				});

				// Debounced save-as-you-type for text fields (L7): the change
				// handler above only persists on blur.
				let __saveDebounce = null;
				["username", "password", "displayName", "callerID"].forEach((id) => {
					const el = document.getElementById(id);
					if (el) {
						el.addEventListener("input", () => {
							clearTimeout(__saveDebounce);
							__saveDebounce = setTimeout(() => Storage.saveConfig(), 1000);
						});
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
				if (
					userAgent &&
					userAgent.transport &&
					userAgent.transport.ws &&
					webSocketMessageHandler
				) {
					userAgent.transport.ws.removeEventListener(
						"message",
						webSocketMessageHandler,
					);
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

			// Cleanup on window close (using pagehide instead of beforeunload for better compatibility)
			window.addEventListener("pagehide", () => {
				cleanupAllResources();
			});

			// Note: We don't cleanup on visibility change (minimize) because we want
			// the app to stay registered when minimized. The app should only cleanup
			// when actually closing (pagehide event).
		
