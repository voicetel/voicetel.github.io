// VoiceTel Phone web client — vendored verbatim from voicetel-phone-desktop v3.8.8
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
			// An unanswered incoming call rings until the caller or the server ends
			// it: the proxies end an unanswered INVITE at 120 s, so this is only a
			// safety net for a lost CANCEL (10 s past the server's limit).
			const INCOMING_CALL_TIMEOUT_MS = 130000;
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
			// How long a call may stay on a disconnected SIP transport (WebSocket
			// closed and not reconnected by sip.js) before it is ended locally
			// with the normal teardown, so a dead call cannot hold the screen
			// and block re-registration.
			const CALL_TRANSPORT_LOSS_TIMEOUT_MS = 10000;
			// Config is exposed by preload.js (contextBridge) before this
			// script runs — see main.js additionalArguments / preload.js.
			// NB: read into a DIFFERENTLY named const — a top-level `const
			// VOICETEL_CONFIG` would collide with the non-configurable global
			// that contextBridge defines and abort the whole inline script.
			const INJECTED_CONFIG = window.VOICETEL_CONFIG || {};
			const APP_VERSION = INJECTED_CONFIG.version || "3.8.8";
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
							audioOutputId:
								document.getElementById("audioOutputSelect")
									?.value || "",
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
						// Restore the saved audio output once its options exist.
						if (config.audioOutputId) {
							populateAudioOutputs(config.audioOutputId).then(() =>
								applyAudioOutput(),
							);
						}

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
					await localforage.clear();
					try {
						localStorage.clear();
					} catch (e) {
						console.error("Local storage clear failed:", e);
					}
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
			let registrationDesired = false;
			let isMuted = false;
			// Hold state + in-flight latch (D-2). sip.js 0.15.11 hold()/unhold()
			// settle via reinviteAccepted/reinviteFailed, so a tap is latched
			// until the re-INVITE resolves; see toggleHold()/settleHold().
			let isOnHold = false;
			let __holdInFlight = false;
			let __endCallInProgress = false;
			let __holdDesired = false;
			let __holdSettleTimer = null;
			let __transferCompletedHold = false;
			let __rejectionHold = false;
			let __callPanelHoldTimer = null;
			let __lastRejectionText = null;
			let __callOutcome = null;
			let __outgoingRaw = null;
			let __transferTarget = null;
			// Wake lock + refreshed mic track (D-4)
			let wakeLock = null;
			let localAudioTrack = null;
			let callTimer = null;
			let callStartTime = null;
			let ringingAudio = null;
			// Dead-transport watchdog state (see checkCallTransportLoss).
			let __callTransportLossTimer = null;
			let __callTransportLostAt = null;

			// Registration management
			let registrationPromise = null; // Single registration promise to prevent concurrent registrations
			let unregistrationPromise = null; // Track unregistration in progress
			let reRegisterTimeout = null; // Debounce re-registration

			// Event listener cleanup tracking
			let activeEventListeners = new Set();

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

				if (audioContext.state === "suspended") {
					audioContext.resume().catch((err) => {
						console.error("Failed to resume AudioContext:", err);
					});
				}

				const rate = audioContext.sampleRate;
				const buffer = audioContext.createBuffer(
					1,
					Math.round(rate * 6),
					rate,
				);
				const samples = buffer.getChannelData(0);
				// 2 s holds a whole number of 440 and 480 Hz cycles, so the
				// tone ends on a zero crossing and the loop has no click.
				const toneSamples = Math.round(rate * 2);
				for (let i = 0; i < toneSamples; i++) {
					const t = i / rate;
					samples[i] =
						0.1 *
						(Math.sin(2 * Math.PI * 440 * t) +
							Math.sin(2 * Math.PI * 480 * t));
				}

				const source = audioContext.createBufferSource();
				source.buffer = buffer;
				source.loop = true;
				source.connect(audioContext.destination);
				source.start();

				let stopped = false;
				return {
					stop: () => {
						if (stopped) return;
						stopped = true;
						try {
							source.stop();
						} catch {}
						Promise.resolve(audioContext.close()).catch((err) => {
							console.error("Failed to close AudioContext:", err);
						});
					},
				};
			}

			function startRinging() {
				document.getElementById("ringingIndicator").style.display =
					"block";
				document.getElementById("callStatus").textContent =
					"Ringing...";

				if (ringingAudio) {
					const previous = ringingAudio;
					ringingAudio = null;
					try {
						previous.stop();
					} catch (e) {
						log("Could not stop previous ringing tone: " + e.message);
					}
				}

				try {
					ringingAudio = createRingingTone();
				} catch (e) {
					log("Could not generate ringing tone: " + e.message);
				}
			}

			function stopRinging() {
				document.getElementById("ringingIndicator").style.display =
					"none";
				if (
					!__rejectionHold &&
					!__callPanelHoldTimer &&
					!__transferCompletedHold
				) {
					document.getElementById("callStatus").textContent =
						"Call in progress";
				}

				if (ringingAudio) {
					const audio = ringingAudio;
					ringingAudio = null;
					try {
						audio.stop();
					} catch (e) {
						log("Could not stop ringing tone: " + e.message);
					}
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
				if (!currentSession && !incomingSession) {
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

			// One REGISTER Call-ID for this run, and the highest REGISTER CSeq sent
			// so far: every new UA registers under the same Call-ID with a CSeq
			// above the last (RFC 3261 §10.2.4; see RendererHelpers.nextRegisterCseq).
			// It also lets the registrar discard a late expires=0 from a torn-down
			// UA instead of letting it delete the binding the new UA refreshed.
			let registerCallId = null;
			let lastRegisterCseq = 0;
			function registerCallParams() {
				if (!registerCallId) {
					registerCallId = RendererHelpers.generateContactToken(22);
				}
				return {
					callId: registerCallId,
					cseq: RendererHelpers.nextRegisterCseq(lastRegisterCseq, Date.now()),
				};
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
				// After stop(): its expires=0 (if any) has taken the last CSeq.
				lastRegisterCseq = RendererHelpers.noteRegisterCseq(
					lastRegisterCseq,
					ua,
				);
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

			// ---- Dead transport during a call (mobile twin) ----------------
			// If the SIP WebSocket drops during a call and sip.js does not
			// reconnect, the call can never be ended or re-negotiated, and every
			// re-register skipped "because a call is active" left the phone
			// unreachable. A call whose transport stays down for
			// CALL_TRANSPORT_LOSS_TIMEOUT_MS is ended locally with the normal
			// teardown, and re-registration goes ahead.
			function isCallActive() {
				return !!(currentSession || incomingSession);
			}

			function isSipTransportConnected() {
				const transport = userAgent && userAgent.transport;
				return (
					!!transport &&
					typeof transport.isConnected === "function" &&
					transport.isConnected()
				);
			}

			function clearCallTransportLoss() {
				if (__callTransportLossTimer) {
					clearTimeout(__callTransportLossTimer);
					__callTransportLossTimer = null;
				}
				__callTransportLostAt = null;
			}

			// Check a call against its transport. Starts the loss window the
			// first time the transport is seen down during a call, clears it
			// when the transport is back or the call is gone, and ends the call
			// once the window has passed. Returns true when it ended it.
			function checkCallTransportLoss() {
				if (!isCallActive() || isSipTransportConnected()) {
					if (__callTransportLostAt) {
						log(
							"SIP transport back (or call over) - loss window cleared",
						);
					}
					clearCallTransportLoss();
					return false;
				}
				if (!__callTransportLostAt) {
					__callTransportLostAt = Date.now();
					log(
						"SIP transport down during a call - waiting for it to recover",
					);
					return false;
				}
				if (
					Date.now() - __callTransportLostAt <
					CALL_TRANSPORT_LOSS_TIMEOUT_MS
				) {
					return false;
				}
				endCallForTransportLoss();
				return true;
			}

			// Transport "disconnected" during a call: start the loss window and
			// check again when it ends.
			function onSipTransportLost() {
				if (checkCallTransportLoss() || !__callTransportLostAt) return;
				const elapsed = Date.now() - __callTransportLostAt;
				clearTimeout(__callTransportLossTimer);
				__callTransportLossTimer = setTimeout(
					() => {
						__callTransportLossTimer = null;
						checkCallTransportLoss();
					},
					Math.max(0, CALL_TRANSPORT_LOSS_TIMEOUT_MS - elapsed),
				);
			}

			// End a call whose transport did not recover, then re-register on a
			// fresh transport so the phone is reachable again.
			function endCallForTransportLoss() {
				log(
					`SIP transport down for ${CALL_TRANSPORT_LOSS_TIMEOUT_MS / 1000}s during a call - ending the call locally`,
				);
				clearCallTransportLoss();
				const session = currentSession;
				if (session && typeof session.terminate === "function") {
					try {
						session.terminate();
					} catch (error) {
						log(`Terminating the stranded session: ${error.message}`);
					}
				}
				Promise.resolve(endCall())
					.then(() => forceReRegister("transport loss"))
					.catch((error) => {
						log(`Recovery after transport loss failed: ${error.message}`);
					});
			}

			// Does a call block re-registration? Only while its transport is up
			// or still inside the loss window: a session object alone must not,
			// or a call stranded on a dead transport blocks every later re-register.
			function isCallBlockingReRegister() {
				if (!isCallActive()) return false;
				return !checkCallTransportLoss();
			}

			// Follow a UA's transport for the dead-transport check. Events from a
			// UA that has since been replaced are ignored.
			function watchCallTransport(ua) {
				const transport = ua && ua.transport;
				if (!transport || typeof transport.on !== "function") return;
				transport.on("disconnected", () => {
					if (userAgent === ua) onSipTransportLost();
				});
				transport.on("connected", () => {
					if (userAgent === ua) checkCallTransportLoss();
				});
			}

			// SIP Registration
			async function register() {
				registrationDesired = true;
				// If already registering, return existing promise
				if (registrationPromise) {
					log("Registration already in progress, waiting...");
					return registrationPromise;
				}

				// If unregistering, wait for it to complete
				if (unregistrationPromise) {
					log("Waiting for unregistration to complete...");
					await unregistrationPromise;
					if (registrationPromise) {
						log("Registration already in progress, waiting...");
						return registrationPromise;
					}
				}

				// Create new promise for this registration attempt
				const registration = new Promise((resolve, reject) => {
					if (typeof SIP === "undefined") {
						const error = new Error("SIP.js library not available");
						alert(
							"SIP.js library is not loaded. Please refresh the page.",
						);
						log("Error: SIP.js library not available");
						registrationDesired = false;
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
						registrationDesired = false;
						registrationPromise = null;
						reject(error);
						return;
					}

					if (!isValidUsername(username)) {
						const error = new Error("Invalid username format");
						alert("Username must be exactly 10 numeric digits");
						document.getElementById("usernameError").style.display =
							"block";
						registrationDesired = false;
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
								modifiers: [RendererHelpers.applyAudioCodecPolicy],
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

						// Same REGISTER Call-ID as every earlier UA in this run, CSeq
						// above the last one sent (read only now, after any disposal).
						userAgentOptions.registerOptions.params = registerCallParams();
						userAgent = new SIP.UA(userAgentOptions);
						watchCallTransport(userAgent);

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
								const { statusCode, reasonPhrase } =
									RendererHelpers.sipResponseParts(response);
								if (statusCode && reasonPhrase) {
									log(`SIP/2.0 ${statusCode} ${reasonPhrase}`);
								}
								log(`Registration failed: ${cause}`);
								isRegistered = false;
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
							const identity = RendererHelpers.resolveIncomingCaller(
								session,
								window.contactNameForNumber,
							);
							const callerInfo =
								identity.callerName !== "Unknown"
									? identity.callerName
									: identity.callerUri;
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
				registrationPromise = registration;

				// The settle paths inside the executor clear registrationPromise
				// when the attempt ends — but several of them run SYNCHRONOUSLY,
				// i.e. BEFORE the assignment above (the input-validation exits, the
				// "SIP.js not loaded" exit, a throw from `new SIP.UA()`). The
				// assignment then overwrote that null with the already-rejected
				// promise, so a single validation failure left a stale promise
				// behind and every later register() just returned it ("Registration
				// already in progress") instead of trying again. Clearing here,
				// after the assignment and after settlement, closes that ordering
				// hole. (Same bug and same cure as unregister() below.)
				const clearIfCurrent = () => {
					if (registrationPromise === registration) {
						registrationPromise = null;
					}
				};
				registration.then(clearIfCurrent, clearIfCurrent);

				return registration;
			}

			function unregister(preserveRegistrationIntent = false) {
				if (!preserveRegistrationIntent) registrationDesired = false;
				if (unregistrationPromise) {
					log("Unregistration already in progress, waiting...");
					return unregistrationPromise;
				}

				const p = (async () => {
					if (registrationPromise) {
						log(
							"Waiting for registration to complete before unregistering...",
						);
						try {
							await registrationPromise;
						} catch (e) {}
					}

					if (userAgent) {
						userAgent.unregister();
						disposeUserAgent(userAgent);
						userAgent = null;
					}

					isRegistered = false;
					registeredUsername = null;
					registeredDomain = null;
					updateStatus("Disconnected");
					log("Unregistered successfully");
				})();

				unregistrationPromise = p;
				const clearIfCurrent = () => {
					if (unregistrationPromise === p) unregistrationPromise = null;
				};
				p.then(clearIfCurrent, (error) => {
					clearIfCurrent();
					log(`Unregister failed: ${error.message}`);
					console.error(error);
				});
				return p;
			}

			// Re-registration with debouncing
			async function reRegister() {
				// Clear any pending re-registration
				if (reRegisterTimeout) {
					clearTimeout(reRegisterTimeout);
					reRegisterTimeout = null;
				}

				// Check if there's an active call (one stranded on a dead
				// transport is ended instead, see isCallBlockingReRegister)
				if (isCallBlockingReRegister()) {
					log("Cannot re-register during active call");
					return;
				}

				// Debounce: wait 500ms before executing
				reRegisterTimeout = setTimeout(() => {
					reRegisterTimeout = null;
					executeReRegister();
				}, 500);
			}

			async function executeReRegister() {
				try {
					if (isCallBlockingReRegister()) {
						log("Cannot re-register during active call");
						return;
					}
					if (!registrationDesired) {
						log("Registration not desired, skipping re-register");
						return;
					}
					if (registrationPromise || unregistrationPromise) return;

					if (userAgent && userAgent.transport && userAgent.transport.ws) {
						const ws = userAgent.transport.ws;
						if (isRegistered && ws.readyState === WebSocket.OPEN) {
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

					log("Executing re-registration...");
					await unregister(true);
					await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
					if (isCallBlockingReRegister()) {
						log("Cannot re-register during active call");
						return;
					}
					if (!registrationDesired) return;
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
						if (incomingSession) {
							setView("phone");
							document.getElementById("incomingCall").classList.add("active");
							log("Incoming call detected - showing incoming call UI");
						} else if (currentSession && activeCall) {
							showCallControls();
							log("Active call detected - call controls restored");
						}
					if (registrationDesired) {
						forceReRegister("foreground");
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
					if (registrationDesired) {
						forceReRegister("foreground");
					}
				});
			}

			function setupWebSocketMonitoring() {
				setInterval(() => {
					// Backstop for the dead-transport check: end a call whose
					// transport stayed down past the loss window, even if no
					// "disconnected" event was seen.
					checkCallTransportLoss();
					if (!registrationDesired || isCallBlockingReRegister())
						return;
					const ws = userAgent && userAgent.transport && userAgent.transport.ws;
					if (
						!userAgent ||
						!ws ||
						ws.readyState === WebSocket.CLOSED ||
						ws.readyState === WebSocket.CLOSING
					) {
						log("WebSocket connection lost — re-registering");
						registrationPromise = null;
						updateStatus("Connection lost — reconnecting");
						reRegister();
					}
				}, 5000);
			}

			async function forceReRegister(reason) {
				if (isCallBlockingReRegister()) {
					log(`Skipping forced re-register (${reason}); call in progress`);
					return;
				}
				if (!registrationDesired) {
					log(`Skipping forced re-register (${reason}); not registered`);
					return;
				}
				try {
					log(`Forcing re-registration (${reason})...`);
					await unregister(true);
					await new Promise((resolve) => setTimeout(resolve, 1000));
					if (isCallBlockingReRegister()) {
						log(`Skipping forced re-register (${reason}); call in progress`);
						return;
					}
					if (!registrationDesired) return;
					await register();
					log(`Re-registration after ${reason} completed`);
				} catch (error) {
					log(`Forced re-registration failed (${reason}): ${error.message}`);
					console.error("Forced re-registration error:", error);
				}
			}

			function runPresenceHealthCheck() {
				if (!registrationDesired) return;
				if (isCallBlockingReRegister()) return;
				if (registrationPromise || unregistrationPromise) return;
				const ws = userAgent && userAgent.transport && userAgent.transport.ws;
				const open = ws && ws.readyState === WebSocket.OPEN;
				log(
					open
						? "Health check: refreshing possibly stale OPEN transport"
						: "Health check: transport not OPEN, forcing re-register",
				);
				forceReRegister(open ? "dead-socket watchdog" : "health check");
			}

			function setupPresenceListeners() {
				window.addEventListener("online", () => {
					log("Network online — forcing re-registration");
					if (registrationDesired) forceReRegister("network restored");
				});
				window.addEventListener("offline", () => {
					log("Network offline");
					updateStatus("Offline — network lost");
				});
				if (window.electronAPI) {
					if (typeof window.electronAPI.onPowerResume === "function") {
						window.electronAPI.onPowerResume(() => {
							log("System resumed — forcing re-registration");
							if (registrationDesired) forceReRegister("system resume");
						});
					}
					if (typeof window.electronAPI.onPowerSuspend === "function") {
						window.electronAPI.onPowerSuspend(() => {
							log("System suspending");
						});
					}
				}
				setInterval(runPresenceHealthCheck, 60000);
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

			function contactNumberKey(raw) {
				const digits = String(raw == null ? "" : raw).replace(/\D/g, "");
				if (!digits) return "";
				if (digits.length === 11 && digits[0] === "1") return digits.slice(1);
				if (digits.length > 10) return digits.slice(-10);
				return digits;
			}
			let __contactNameIndex = null;
			let __contactNameIndexSrc = null;
			function buildContactNameIndex(list) {
				const map = new Map();
				for (const contact of list || []) {
					const name = contact && contact.name;
					if (!name || name === "Unknown") continue;
					for (const phone of contact.phoneNumbers || []) {
						const key = contactNumberKey(phone && phone.number);
						if (key && !map.has(key)) map.set(key, name);
					}
				}
				return map;
			}
			window.contactNameForNumber = function (input) {
				const list = googleContacts;
				if (!Array.isArray(list) || !list.length) return null;
				if (__contactNameIndexSrc !== list) {
					__contactNameIndex = buildContactNameIndex(list);
					__contactNameIndexSrc = list;
				}
				const key = contactNumberKey(input);
				if (!key) return null;
				return __contactNameIndex.get(key) || null;
			};

			async function initGoogleAuth() {
				const savedToken = await localforage.getItem("google_access_token");
				if (!savedToken) {
					await showCachedContacts();
					return;
				}
				googleAccessToken = savedToken;
				log("Google: Using saved access token");
				try {
					await fetchUserEmail();
					updateAuthUI(true);
					await loadCachedContacts();
					if (googleContacts.length === 0) {
						await loadGoogleContacts(true);
					} else {
						log(`Loaded ${googleContacts.length} cached contacts`);
						renderContacts(googleContacts);
					}
				} catch (error) {
					log(`Google: Failed to load contacts: ${error.message}`);
					if (String(error.message).includes("401")) {
						log("Google: sign-in expired; showing saved contacts");
						await localforage.removeItem("google_access_token");
						localStorage.removeItem("google_access_token");
						googleAccessToken = null;
						await showCachedContacts();
					}
				}
			}

			async function showCachedContacts() {
				updateAuthUI(false);
				const found = await loadCachedContacts();
				const note = document.getElementById("contactsStaleNote");
				if (note) note.style.display = found ? "block" : "none";
				if (found) {
					log(`Showing ${googleContacts.length} saved contacts`);
					renderContacts(googleContacts);
				}
			}

			async function loadCachedContacts() {
				try {
					const cachedEmail = await localforage.getItem(CONTACTS_CACHE_EMAIL_KEY);
					const cachedContacts = await localforage.getItem(CONTACTS_CACHE_KEY);
					
					// Use the cache unless the signed-in account is known to differ
					if (
						cachedContacts &&
						(!currentGoogleEmail || cachedEmail === currentGoogleEmail)
					) {
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

					if (response.status === 401) {
						const expired = new Error("HTTP 401: Unauthorized");
						expired.expired = true;
						throw expired;
					}
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
					if (error.expired) throw error;
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
						await showCachedContacts();
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
						// A phone entry without a number (Google's value is
						// optional; the cache may hold anything) is skipped, not
						// a TypeError that blanks the whole list.
						const cleaned = String(phoneObj?.number || "").replace(
							/\D/g,
							"",
						);
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
				const staleNote = document.getElementById("contactsStaleNote");
				if (staleNote && isSignedIn) staleNote.style.display = "none";
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
						const phoneNumber = String(phoneObj?.number || "");
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

			function syncCallingName() {
				const displayName =
					RendererHelpers.sanitizeCallingName(
						document.getElementById("displayName")?.value,
					) ||
					registeredUsername ||
					document.getElementById("username")?.value ||
					"";
				if (userAgent) {
					if (userAgent.configuration) {
						userAgent.configuration.displayName = displayName;
					}
					if (userAgent.userAgentCore?.configuration) {
						userAgent.userAgentCore.configuration.displayName = displayName;
					}
					if (userAgent.options) userAgent.options.displayName = displayName;
				}
				return displayName;
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

				if (currentSession) {
					alert("Please end the current call first");
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
					const displayName = syncCallingName();
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
					if (displayName) {
						options.params = { fromDisplayName: displayName };
					}
					const pAssertedIdentity = `"${displayName}" <sip:${identityUser}@${SIP_DOMAIN}>`;
					log(`Caller ID: ${displayName} ${identityUser}`);
					options.extraHeaders = [
						"P-Asserted-Identity: " + pAssertedIdentity,
					];

					currentSession = userAgent.invite(uri, options);
					__callDirection = "outgoing";
					__outgoingRaw = number;
					__callOutcome = null;
					__transferTarget = null;

					// Ringback is driven solely by setupSessionHandlers'
					// progress/response events. The old raw-WebSocket 18x
					// sniffer that also started it is gone (single ring source).
					applyAudioOutput();
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
				// Busy check FIRST: the resets below are for a NEW call. Run on a
				// second INVITE during a call, they wiped the live call's caller
				// number, so its history entry was saved as "Unknown".
				if (currentSession || incomingSession) {
					log("Auto-rejecting incoming call - already in a call");
					// Pass the status explicitly: SIP.js 0.15's reject() with no
					// options sends 480 Temporarily Unavailable, not 486.
					session.reject({ statusCode: 486, reasonPhrase: "Busy Here" });
					log("SIP/2.0 486 Busy Here");
					return;
				}

				__incomingRaw = null;
				__incomingDisplay = null;

				incomingSession = session;
				log("SIP INVITE received");
				// The update banner says a restart waits for the call.
				renderUpdateUi();

				const { callerName, callerUri } =
					RendererHelpers.resolveIncomingCaller(
						session,
						window.contactNameForNumber,
					);
				__incomingRaw = callerUri;
				const formattedNumber = formatPhoneNumber(callerUri) || callerUri;

				document.getElementById("incomingCallerName").textContent =
					callerName;
				document.getElementById("incomingCallerNumber").textContent =
					formattedNumber;
				__incomingDisplay = formattedNumber;

				const verStat = RendererHelpers.twilioVerStat(session);
				const verStatBadge = document.getElementById("incomingVerStat");
				verStatBadge.textContent =
					verStat.kind === "none" ? "" : `VerStat: ${verStat.value}`;
				verStatBadge.className =
					verStat.kind === "none"
						? "incoming-verstat"
						: `incoming-verstat verstat-${verStat.kind}`;
				verStatBadge.hidden = verStat.kind === "none";

				document.getElementById("incomingCall").classList.add("active");
				hideDialpad();
				startRinging();
				log("SIP/2.0 180 Ringing");
				log(`Incoming call from ${callerName} ${formattedNumber}`);
				log("Press Enter to answer or Escape to decline");

				incomingCallTimeout = setTimeout(() => {
					if (incomingSession === session) {
						log(
							`Unanswered after ${INCOMING_CALL_TIMEOUT_MS / 1000} seconds — missed call`,
						);
						missIncomingCall();
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
				__callOutcome = null;
				__transferTarget = null;
				activeCall = true;

				hideIncomingCallUI();
				applyAudioOutput();
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
				return rejectIncomingCall("declined");
			}

			// The no-answer ring timeout: nobody answered. Reply 480 Temporarily
			// Unavailable (not the 486 a user decline sends) and log it as missed.
			function missIncomingCall() {
				return rejectIncomingCall("missed");
			}

			// End the ringing incoming call locally. "declined" (the user said no)
			// replies 486 Busy Here and logs a declined call; "missed" (unanswered
			// timeout) replies 480 Temporarily Unavailable and logs a missed call.
			function rejectIncomingCall(kind) {
				const missed = kind === "missed";
				if (!incomingSession) {
					log("No incoming call to decline");
					return;
				}

				if (incomingCallTimeout) {
					clearTimeout(incomingCallTimeout);
					incomingCallTimeout = null;
				}

				// Mark as declined by user before rejecting so this specific
				// session's own terminated handler does not record a second entry.
				incomingSession.__declinedByUser = true;

				// Log as declined/missed
				const num =
					__incomingRaw && __incomingRaw !== "Unknown"
						? __incomingRaw
						: __incomingDisplay ||
							document.getElementById("incomingCallerNumber")
								.textContent ||
							"Unknown";
				Storage.addCallToHistory(missed ? "missed" : "declined", num, "00:00");

				// Send the rejection
				const statusCode = missed ? 480 : 486;
				const reasonPhrase = missed
					? "Temporarily Unavailable"
					: "Busy Here";
				incomingSession.reject({ statusCode, reasonPhrase });

				hideIncomingCallUI();
				stopRinging();
				log(missed ? "Call missed" : "Call declined");
				log(`SIP/2.0 ${statusCode} ${reasonPhrase}`);
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
				const verStatBadge = document.getElementById("incomingVerStat");
				verStatBadge.textContent = "";
				verStatBadge.className = "incoming-verstat";
				verStatBadge.hidden = true;
				showDialpad();
				// Callers clear incomingSession right after this, so the update
				// banner re-renders once they have.
				setTimeout(renderUpdateUi, 0);
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

			// --- Audio output routing (desktop Speaker equivalent) --------
			// Mobile routes earpiece<->speaker natively and seeds it from
			// "Start calls on speaker". A desktop has named outputs instead:
			// the Settings selection is the seeded route, applied to
			// #remoteAudio via setSinkId at every call start, and the in-call
			// 🔊 Output button cycles the available outputs.
			let __audioOutputDevices = [];

			async function populateAudioOutputs(preferredId) {
				const select = document.getElementById("audioOutputSelect");
				if (
					!navigator.mediaDevices ||
					!navigator.mediaDevices.enumerateDevices
				) {
					return [];
				}
				try {
					const devices =
						await navigator.mediaDevices.enumerateDevices();
					__audioOutputDevices = devices.filter(
						(d) => d.kind === "audiooutput",
					);
				} catch (err) {
					log(`Audio output list failed: ${err.message}`);
					return __audioOutputDevices;
				}
				if (select) {
					const wanted =
						preferredId !== undefined ? preferredId : select.value || "";
					select.innerHTML = "";
					const def = document.createElement("option");
					def.value = "";
					def.textContent = "System default";
					select.appendChild(def);
					__audioOutputDevices.forEach((d, i) => {
						if (d.deviceId === "default" || d.deviceId === "") return;
						const opt = document.createElement("option");
						opt.value = d.deviceId;
						opt.textContent = d.label || `Output ${i + 1}`;
						select.appendChild(opt);
					});
					select.value = __audioOutputDevices.some(
						(d) => d.deviceId === wanted,
					)
						? wanted
						: "";
				}
				return __audioOutputDevices;
			}

			// Apply the selected output to the remote-audio element. Returns
			// false when routing is unsupported or no element exists.
			function applyAudioOutput() {
				const remoteAudio = document.getElementById("remoteAudio");
				const select = document.getElementById("audioOutputSelect");
				if (!remoteAudio || typeof remoteAudio.setSinkId !== "function") {
					return false;
				}
				const id = select ? select.value || "" : "";
				try {
					const result = remoteAudio.setSinkId(id);
					if (result && typeof result.catch === "function") {
						result.catch((err) => {
							log(`Audio output switch failed: ${err.message}`);
						});
					}
				} catch (err) {
					log(`Audio output switch failed: ${err.message}`);
					return false;
				}
				return true;
			}

			// Cycle to the next output (wraps), apply it, and persist it as
			// the seeded output for later calls.
			async function cycleAudioOutput() {
				if (__audioOutputDevices.length === 0) {
					await populateAudioOutputs();
				}
				const ids = __audioOutputDevices
					.map((d) => d.deviceId)
					.filter((id) => id && id !== "default");
				const select = document.getElementById("audioOutputSelect");
				const current = select ? select.value || "" : "";
				const next = RendererHelpers.nextAudioOutputId(
					["", ...ids],
					current,
				);
				if (select) select.value = next;
				applyAudioOutput();
				const device = __audioOutputDevices.find(
					(d) => d.deviceId === next,
				);
				log(
					next
						? `🔊 Audio output: ${device?.label || next}`
						: "🔊 Audio output: System default",
				);
				Storage.saveConfig();
			}

			function displayRejectionError(response) {
				const { statusCode, reasonPhrase } =
					RendererHelpers.sipResponseParts(response);
				let text = "Call failed";
				if (typeof statusCode === "number") {
					text = `SIP ${statusCode}`;
					if (reasonPhrase) text += `: ${reasonPhrase}`;
				}
				const statusEl = document.getElementById("callStatus");
				if (statusEl) statusEl.textContent = text;
				__lastRejectionText = text;
				__rejectionHold = true;
			}

			function setupSessionHandlers(session) {
				// `ringingStarted` is true while this session's ringback plays;
				// `ringbackUsed` makes it start at most once per call, so a late
				// 18x (a re-sent 180, a forked leg, a 183 after the 200) can never
				// restart it.
				let ringingStarted = false;
				let ringbackUsed = false;
				// A session that is no longer the current call (an adopted transfer
				// replaced it, or a new call started) must not touch the global
				// ringing tone or the call UI.
				const isStale = () =>
					!!currentSession && currentSession !== session;

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
							__outgoingRaw =
								next.remoteIdentity?.uri?.user ||
								next.request?.to?.uri?.user ||
								__transferTarget;
							__transferTarget = __outgoingRaw;
							__callOutcome = null;
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
					updateCallControlAvailability();
					session.on("confirmed", updateCallControlAvailability);

					session.on("response", (response) => {
						const { statusCode, reasonPhrase } =
							RendererHelpers.sipResponseParts(response);
						// Reason phrase is optional: ringback starts on the
						// first 180/183 either way (mobile twin 65ea543).
						if (statusCode) {
							log(
								`SIP/2.0 ${statusCode}${reasonPhrase ? " " + reasonPhrase : ""}`,
							);
							if (
								!ringbackUsed &&
								(statusCode === 180 || statusCode === 183)
							) {
								startRinging();
								ringingStarted = true;
								ringbackUsed = true;
							}
							if (statusCode === 200) {
								if (ringingStarted) {
									stopRinging();
									ringingStarted = false;
								}
								startCallTimer();
							}
						}
					});

					session.on("progress", (response) => {
						const { statusCode, reasonPhrase } =
							RendererHelpers.sipResponseParts(response);
						if (statusCode) {
							log(
								`SIP/2.0 ${statusCode}${reasonPhrase ? " " + reasonPhrase : ""}`,
							);
							if (
								!ringbackUsed &&
								(statusCode === 180 || statusCode === 183)
							) {
								startRinging();
								ringingStarted = true;
								ringbackUsed = true;
							}
							if (statusCode === 183) {
								const remoteAudio = document.getElementById("remoteAudio");
								if (remoteAudio) {
									remoteAudio.volume = 0;
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
						if (currentSession && currentSession !== session) {
							log("Old (transferred) leg ended — keeping the adopted call");
							return;
						}
						log("Call ended" + (cause ? ": " + cause : ""));
						endCall();
					});

					session.on("failed", (response, cause) => {
						const { statusCode, reasonPhrase } =
							RendererHelpers.sipResponseParts(response);
						if (statusCode && reasonPhrase) {
							log(`SIP/2.0 ${statusCode} ${reasonPhrase}`);
						}
						// A leg we no longer track (a transferred-away call, an
						// earlier call failing late) must not touch the ringing tone
						// or tear down the current call.
						if (isStale()) {
							ringingStarted = false;
							log("Stale call leg failed — leaving the current call alone");
							return;
						}
						if (ringingStarted) {
							stopRinging();
							ringingStarted = false;
						}
						if (session.__localCancel) {
							// Our own hangup/CANCEL ends in 487 Request Terminated:
							// that is the expected outcome, not a rejection to show.
							log("Call cancelled");
						} else {
							__callOutcome = "failed";
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
							} else if (typeof statusCode === "number") {
								displayRejectionError(response);
							} else {
								log("Call failed: " + (cause || "Unknown error"));
							}
						}
						endCall();
					});

					session.on("rejected", (response, cause) => {
						const { statusCode, reasonPhrase } =
							RendererHelpers.sipResponseParts(response);
						if (statusCode && reasonPhrase) {
							log(`SIP/2.0 ${statusCode} ${reasonPhrase}`);
						}
						if (isStale()) {
							ringingStarted = false;
							log("Stale call leg rejected — leaving the current call alone");
							return;
						}
						if (ringingStarted) {
							stopRinging();
							ringingStarted = false;
						}
						if (session.__localCancel) {
							log("Call cancelled");
						} else {
							__callOutcome = "rejected";
							if (typeof statusCode === "number") {
								displayRejectionError(response);
							}
							log("Call rejected" + (cause ? ": " + cause : ""));
						}
						endCall();
					});

					// sip.js emits "cancel" from cancel() (vendored 0.15.11). When
					// the INVITE was already sent a CANCEL goes out and the 487 then
					// fires rejected/failed/terminated, which tear down. When the
					// hangup came BEFORE the INVITE was sent, sip.js never sends it
					// and emits nothing else, so this is the only teardown that call
					// will get.
					session.on("cancel", () => {
						session.__localCancel = true;
						if (isStale()) {
							ringingStarted = false;
							return;
						}
						if (ringingStarted) {
							stopRinging();
							ringingStarted = false;
						}
						if (session.outgoingInviteRequest) {
							log("CANCEL sent — waiting for 487");
							return;
						}
						log("Call cancelled before the INVITE was sent");
						endCall();
					});

					session.on("bye", (request) => {
						log("SIP BYE received");
						log("Call ended by remote");
						if (ringingStarted) {
							stopRinging();
							ringingStarted = false;
						}
						if (currentSession && currentSession !== session) {
							log("Old (transferred) leg's BYE — keeping the adopted call");
							return;
						}
						endCall();
					});

					session.on("accepted", (response) => {
						updateCallControlAvailability();
						const { statusCode, reasonPhrase } =
							RendererHelpers.sipResponseParts(response);
						if (statusCode && reasonPhrase) {
							log(`SIP/2.0 ${statusCode} ${reasonPhrase}`);
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
						__callOutcome = "completed";
						log("Call connected");

						startCallTimer();
						requestWakeLock();

						try {
							const pc =
								session.sessionDescriptionHandler
									.peerConnection;
							attachRemoteAudio(pc, { volume: 1.0 });
							applyAudioOutput();

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
												hangup();
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
							applyAudioOutput();
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
				if (currentSession) {
					if (!__callOutcome) {
						__callOutcome = activeCall ? "completed" : "cancelled";
					}
					log("Hanging up...");
				}
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
				const result = RendererHelpers.applyMuteToggle(pc, isMuted, isOnHold);
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
					!RendererHelpers.canHold(currentSession) ||
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

			function markTransferCompleted() {
				__transferCompletedHold = true;
				__callOutcome = "transferred";
				const statusEl = document.getElementById("callStatus");
				if (statusEl) statusEl.textContent = "Transfer completed";
			}

			function transferCall() {
				if (!currentSession) {
					alert("No active call to transfer");
					return;
				}
				if (!RendererHelpers.canTransfer(currentSession, __callDirection)) {
					log(
						__callDirection === "incoming"
							? "Transfer is available once the call is connected"
							: "Transfer is only available on calls you answered",
					);
					return;
				}
				const bar = document.getElementById("transferBar");
				const input = document.getElementById("transferTarget");
				if (!bar) return;
				const showing = bar.style.display !== "none";
				bar.style.display = showing ? "none" : "flex";
				if (!showing && input) {
					input.value = "";
					input.focus();
				}
			}

			function cancelTransfer() {
				const bar = document.getElementById("transferBar");
				const input = document.getElementById("transferTarget");
				if (bar) bar.style.display = "none";
				if (input) input.value = "";
			}

			function confirmTransfer() {
				if (!currentSession) {
					cancelTransfer();
					alert("No active call to transfer");
					return;
				}
				if (!RendererHelpers.canTransfer(currentSession, __callDirection)) {
					cancelTransfer();
					log(
						__callDirection === "incoming"
							? "Transfer is available once the call is connected"
							: "Transfer is only available on calls you answered",
					);
					return;
				}
				const input = document.getElementById("transferTarget");
				const number = RendererHelpers.normalizeTransferTarget(
					input ? input.value : "",
				);
				if (!number) {
					alert("Please enter a valid number");
					return;
				}
				cancelTransfer();

				try {
					const target = RendererHelpers.buildTransferUri(number, SIP_DOMAIN);
					const ctx = currentSession.refer(target);
					log(`Transferring call to ${number}...`);
					if (ctx && typeof ctx.on === "function") {
						ctx.on("referAccepted", () => {
							log("Transfer succeeded (NOTIFY 200) — leaving the call");
							__transferTarget = number;
							markTransferCompleted();
							hangup();
						});
						ctx.on("referRequestRejected", () => {
							log("Transfer rejected — staying in the call");
						});
						ctx.on("referRejected", () => {
							log("Transfer failed at the target — staying in the call");
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
					currentSession,
					__callDirection,
				);
				transferBtn.disabled = !ok;
				transferBtn.style.opacity = ok ? "" : "0.45";
			}

			function updateHoldAvailability() {
				const holdBtn = document.getElementById("holdBtn");
				if (!holdBtn) return;
				const ok = RendererHelpers.canHold(currentSession);
				holdBtn.disabled = !ok;
				holdBtn.style.opacity = ok ? "" : "0.45";
			}

			function updateCallControlAvailability() {
				updateHoldAvailability();
				updateTransferAvailability();
				// The update banner says whether a restart waits for the call.
				renderUpdateUi();
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
					const enabled = !isMuted && !isOnHold;
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
				clearTimeout(__callPanelHoldTimer);
				__callPanelHoldTimer = null;
				__rejectionHold = false;
				__transferCompletedHold = false;
				document.getElementById("callControls").classList.add("active");
				document.getElementById("callBtn").disabled = true;
				document.getElementById("callStatus").textContent = "Call in progress";
				hideDialpad();
				updateCallControlAvailability();
				requestWakeLock();
			}

			function hideCallControls() {
				document
					.getElementById("callControls")
					.classList.remove("active");
				document.getElementById("callBtn").disabled = false;
				showDialpad();
				releaseWakeLock();
				stopCallTimer();
			}

			async function endCall() {
				if (__endCallInProgress) {
					log("endCall already in progress, skipping duplicate");
					return;
				}
				__endCallInProgress = true;
				try {
					const direction = __callDirection;
					const session = currentSession;
					const outcome =
						__callOutcome || (activeCall ? "completed" : "unanswered");
					const duration = RendererHelpers.formatCallDuration(
						callStartTime,
						Date.now(),
					);
					const incomingNumber =
						__incomingRaw && __incomingRaw !== "Unknown"
							? __incomingRaw
							: __incomingDisplay || "Unknown";
					const outgoingNumber =
						__transferTarget ||
						session?.remoteIdentity?.uri?.user ||
						session?.request?.to?.uri?.user ||
						__outgoingRaw ||
						document.getElementById("callNumber").value ||
						"Unknown";
					const number =
						__transferTarget ||
						(direction === "outgoing" ? outgoingNumber : incomingNumber);
					const historyType = outcome === "completed" ? direction : outcome;

					cancelTransfer();
				if (ringingAudio) {
					const audio = ringingAudio;
					ringingAudio = null;
					try {
						audio.stop();
					} catch (e) {
						log("Could not stop ringing tone: " + e.message);
					}
				}
					stopCallTimer();

					try {
						if (direction) {
							Storage.addCallToHistory(historyType, number, duration);
						}
					} catch (e) {
						console.error("Failed to save call history:", e);
					}

					currentSession = null;
					__callDirection = null;
					__answeredIncoming = false;
					__callOutcome = null;
					__outgoingRaw = null;
					__transferTarget = null;
					__incomingRaw = null;
					__incomingDisplay = null;
					activeCall = false;

					const transferHold = __transferCompletedHold === true;
					const rejectionHold = __rejectionHold === true;
					__transferCompletedHold = false;
					__rejectionHold = false;
					const closeCallPanel = () => {
						__callPanelHoldTimer = null;
						hideCallControls();
						document.getElementById("callStatus").textContent =
							"Call in progress";
					};
					if (transferHold || rejectionHold) {
						clearTimeout(__callPanelHoldTimer);
						__callPanelHoldTimer = setTimeout(
							closeCallPanel,
							TRANSFER_COMPLETED_MS,
						);
					} else if (!__callPanelHoldTimer) {
						closeCallPanel();
					}
					stopRinging();
					isMuted = false;
					document.getElementById("muteBtn").textContent = "Mute";
					isOnHold = false;
					__holdInFlight = false;
					__holdDesired = false;
					clearTimeout(__holdSettleTimer);
					const holdBtnEl = document.getElementById("holdBtn");
					if (holdBtnEl) holdBtnEl.textContent = "Hold";
					updateCallControlAvailability();
					releaseWakeLock();
					if (localAudioTrack) {
						localAudioTrack.stop();
						localAudioTrack = null;
					}
					document.getElementById("callNumber").placeholder =
						"Enter number to dial / DTMF during call";
					const showDialpadBtn = document.getElementById("showDialpadBtn");
					if (showDialpadBtn) {
						showDialpadBtn.style.display = "none";
						showDialpadBtn.textContent = "Dialpad";
					}
				} finally {
					__endCallInProgress = false;
				}
			}

			function startCallTimer() {
				if (callTimer) clearInterval(callTimer);
				if (!callStartTime) callStartTime = Date.now();
				callTimer = setInterval(updateCallDuration, 1000);
				updateCallDuration();
			}

			function stopCallTimer() {
				if (callTimer) {
					clearInterval(callTimer);
					callTimer = null;
				}
				callStartTime = null;
				document.getElementById("callDuration").textContent = "00:00";
			}

			function updateCallDuration() {
				if (!callStartTime) return;
				document.getElementById("callDuration").textContent =
					RendererHelpers.formatCallDuration(callStartTime, Date.now());
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
				// A live session is required. (This used to also pass when only
				// __answeredIncoming was set, and then dereferenced the null
				// currentSession below — a TypeError instead of a clean refusal.)
				if (!currentSession) {
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
					} else if (item.type === "rejected") {
						icon = "⛔";
						callType = "Rejected";
					} else if (item.type === "cancelled") {
						icon = "⛔";
						callType = "Cancelled";
					} else if (item.type === "failed") {
						icon = "🔴";
						callType = "Failed";
					} else if (item.type === "unanswered") {
						icon = "🔴";
						callType = "Unanswered";
					} else if (item.type === "transferred") {
						icon = "⬆️";
						callType = "Transferred";
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
										${callType.toLowerCase()}${item.duration ? ` · ${RendererHelpers.escapeHtml(item.duration)}` : ""}
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
					if (currentSession || incomingSession) {
						log("Redial refused - a call is already active or ringing");
						return false;
					}
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

			async function clearAllData() {
				if (currentSession || incomingSession) {
					alert("Please end the current call before clearing saved data");
					return false;
				}
				if (
					!window.confirm(
						"Clear all saved credentials, contacts, history, tokens, theme, and event logs?",
					)
				) {
					return false;
				}

				registrationDesired = false;
				try {
					if (userAgent || registrationPromise || unregistrationPromise) {
						await unregister();
					}
				} catch (error) {
					if (userAgent) disposeUserAgent(userAgent);
					userAgent = null;
					console.error("Unregister during clear failed:", error);
				}
				clearTimeout(reRegisterTimeout);
				reRegisterTimeout = null;
				clearTimeout(__callPanelHoldTimer);
				__callPanelHoldTimer = null;
				clearTimeout(__holdSettleTimer);
				__holdSettleTimer = null;
				if (callTimer) clearInterval(callTimer);
				callTimer = null;
				callStartTime = null;

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
				["saveCredentials", "registerOnStartup", "hideEventLog"].forEach(
					(id) => {
						const el = document.getElementById(id);
						if (el) el.checked = false;
					},
				);
				["usernameError", "callerIDError"].forEach((id) => {
					const el = document.getElementById(id);
					if (el) el.style.display = "none";
				});
				applyTheme("system");
				const themeSelect = document.getElementById("themeSelect");
				if (themeSelect) themeSelect.value = "system";
				const audioOutputSelect =
					document.getElementById("audioOutputSelect");
				if (audioOutputSelect) audioOutputSelect.value = "";

				await Storage.clearAll();

				window.__sipContactUser = null;
				registerCallId = null;
				lastRegisterCseq = 0;
				googleAccessToken = null;
				googleContacts = [];
				currentGoogleEmail = null;
				__contactNameIndex = null;
				__contactNameIndexSrc = null;
				registeredUsername = null;
				registeredDomain = null;
				registrationPromise = null;
				unregistrationPromise = null;
				isRegistered = false;
				registrationDesired = false;
				activeCall = false;
				__callDirection = null;
				__answeredIncoming = false;
				__incomingRaw = null;
				__incomingDisplay = null;
				__callOutcome = null;
				__outgoingRaw = null;
				__transferTarget = null;
				isMuted = false;
				isOnHold = false;
				__rejectionHold = false;
				__transferCompletedHold = false;
				__lastRejectionText = null;
				__holdInFlight = false;
				__holdDesired = false;
				__endCallInProgress = false;

				const logElement = document.getElementById("log");
				if (logElement) logElement.innerHTML = "";
				const userEmail = document.getElementById("userEmail");
				if (userEmail) userEmail.textContent = "";
				updateAuthUI(false);
				const staleNote = document.getElementById("contactsStaleNote");
				if (staleNote) staleNote.style.display = "none";
				renderContacts([]);
				updateEventLogVisibility();
				updateStatus("Disconnected");
				await renderCallHistory();
				return true;
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

			// --- Automatic updates ------------------------------------------
			// The main process (lib/app-updater.js) checks, downloads and
			// reports its status here; lib/update-banner.js decides what the
			// banner and Settings → Updates say. Nothing restarts without the
			// user's click, and never while a call is up. (Ported from
			// voiceml-phone-desktop.)
			let __updateStatus = null;
			let __dismissedUpdateVersion = null;

			// A call is up or ringing. The main process asks this before it
			// restarts into an update; the banner reads it too.
			function isCallBusy() {
				return Boolean(currentSession || incomingSession);
			}

			function renderUpdateUi() {
				const banner = document.getElementById("updateBanner");
				const view = UpdateBanner.bannerFor(__updateStatus, {
					inCall: isCallBusy(),
					dismissedVersion: __dismissedUpdateVersion,
				});
				if (banner) {
					banner.classList.toggle("hidden", !view);
					if (view) {
						document.getElementById("updateBannerText").textContent =
							view.text;
						const action = document.getElementById("updateBannerAction");
						action.textContent = view.actionLabel;
						action.dataset.action = view.action;
					}
				}
				const line = document.getElementById("updateStatusLine");
				if (line) line.textContent = UpdateBanner.settingsLine(__updateStatus);
				const checkBtn = document.getElementById("updateCheckBtn");
				if (checkBtn) checkBtn.disabled = !UpdateBanner.canCheck(__updateStatus);
			}

			function setUpdateStatus(status) {
				__updateStatus = status || null;
				renderUpdateUi();
			}

			async function onUpdateBannerAction() {
				const api = window.electronAPI;
				const action =
					document.getElementById("updateBannerAction").dataset.action;
				try {
					if (action === "download") {
						await api.openUpdateDownload();
						return;
					}
					if (isCallBusy()) {
						log("⬆️ The update installs once the call has ended");
						renderUpdateUi();
						return;
					}
					const result = await api.installUpdate();
					if (result && !result.ok) {
						log(
							result.reason === "call"
								? "⬆️ The update installs once the call has ended"
								: "⬆️ No downloaded update to install",
						);
					}
				} catch (e) {
					log(`⬆️ Update action failed: ${e && e.message}`);
				}
			}

			// The tray's "Check for Updates…" opens the window here. A call that is
			// up or ringing keeps its screen; the banner still shows the result.
			function showUpdateSettings() {
				if (isCallBusy()) return;
				showSettings();
				document
					.getElementById("updateCheckBtn")
					.scrollIntoView({ block: "center" });
			}

			function initUpdates() {
				const versionLine = document.getElementById("updateVersionLine");
				if (versionLine) versionLine.textContent = `VoiceTel ${APP_VERSION}`;
				const api = window.electronAPI;
				if (!api || typeof api.getUpdateStatus !== "function") {
					renderUpdateUi();
					return;
				}
				api.onUpdateStatus(setUpdateStatus);
				api.onShowUpdates(showUpdateSettings);
				api
					.getUpdateStatus()
					.then(setUpdateStatus)
					.catch((e) => log(`⬆️ Update status unavailable: ${e && e.message}`));
				document
					.getElementById("updateBannerAction")
					.addEventListener("click", onUpdateBannerAction);
				document
					.getElementById("updateBannerLater")
					.addEventListener("click", () => {
						__dismissedUpdateVersion = __updateStatus && __updateStatus.version;
						renderUpdateUi();
					});
				document.getElementById("updateCheckBtn").addEventListener("click", () => {
					api
						.checkForUpdates()
						.then(setUpdateStatus)
						.catch((e) => log(`⬆️ Update check failed: ${e && e.message}`));
				});
			}

			window.addEventListener("DOMContentLoaded", async function () {
				// Update page title with version
				document.title = `VoiceTel Phone v${APP_VERSION}`;

				// Apply the saved appearance + wire the selector (D-5)
				initThemeControl();
				restoreEventLog(); // (M9/L8)

				// Audio outputs: list them and follow device changes.
				populateAudioOutputs();
				if (
					navigator.mediaDevices &&
					typeof navigator.mediaDevices.addEventListener === "function"
				) {
					navigator.mediaDevices.addEventListener(
						"devicechange",
						() => populateAudioOutputs(),
					);
				}

				// Automatic updates: status from the main process, the banner
				// and Settings → Updates. Before the SIP.js check below, so a
				// copy whose page failed to load SIP.js can still update.
				initUpdates();

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
				setupPresenceListeners();

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
					"audioOutputSelect",
				].forEach((id) => {
					const el = document.getElementById(id);
					if (el) {
						el.addEventListener("change", () => {
							Storage.saveConfig();
							if (id === "displayName") syncCallingName();
							// Update event log visibility when hideEventLog changes
							if (id === "hideEventLog") {
								updateEventLogVisibility();
							}
							if (id === "audioOutputSelect") {
								applyAudioOutput();
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
							if (id === "displayName") syncCallingName();
							clearTimeout(__saveDebounce);
							__saveDebounce = setTimeout(() => Storage.saveConfig(), 1000);
						});
					}
				});

				const transferInput = document.getElementById("transferTarget");
				if (transferInput) {
					transferInput.addEventListener("keydown", (e) => {
						if (e.key === "Enter") {
							e.stopPropagation();
							e.preventDefault();
							confirmTransfer();
						} else if (e.key === "Escape") {
							e.stopPropagation();
							e.preventDefault();
							cancelTransfer();
						}
					});
				}

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
				registrationDesired = false;
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
