// Encrypted, device-bound API-key store for the v2.2 playground.
//
// The plaintext key is encrypted under an AES-GCM 256 master key that is
// generated with `extractable: false` and persisted in IndexedDB as an
// opaque CryptoKey handle. The browser binds that handle to the platform
// key vault, so copying the IndexedDB files to another machine yields an
// unusable handle on the destination.
//
// Public surface: setKey, removeKey, hasKey, authorize. There is no read
// path that returns plaintext — `authorize(init)` is the only way to use
// it, and it only assigns the decrypted key to a fresh Headers object on
// the outgoing fetch init.

const DB_NAME = "voicetel-playground";
const DB_VERSION = 1;
const KEYS_STORE = "keys";
const SECRETS_STORE = "secrets";
const MASTER_ID = "master";
const SECRET_ID = "apiKey";

const ALGO = { name: "AES-GCM", length: 256 };
const KEY_USAGE_MASTER = ["wrapKey", "unwrapKey"];
const KEY_USAGE_DATA = ["encrypt", "decrypt"];

let dbPromise = null;

function openDb() {
	if (dbPromise) return dbPromise;
	dbPromise = new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(KEYS_STORE)) {
				db.createObjectStore(KEYS_STORE, { keyPath: "id" });
			}
			if (!db.objectStoreNames.contains(SECRETS_STORE)) {
				db.createObjectStore(SECRETS_STORE, { keyPath: "id" });
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
	return dbPromise;
}

function tx(storeName, mode) {
	return openDb().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function idbGet(storeName, id) {
	return tx(storeName, "readonly").then(
		(store) =>
			new Promise((resolve, reject) => {
				const req = store.get(id);
				req.onsuccess = () => resolve(req.result);
				req.onerror = () => reject(req.error);
			})
	);
}

function idbPut(storeName, value) {
	return tx(storeName, "readwrite").then(
		(store) =>
			new Promise((resolve, reject) => {
				const req = store.put(value);
				req.onsuccess = () => resolve();
				req.onerror = () => reject(req.error);
			})
	);
}

function idbDelete(storeName, id) {
	return tx(storeName, "readwrite").then(
		(store) =>
			new Promise((resolve, reject) => {
				const req = store.delete(id);
				req.onsuccess = () => resolve();
				req.onerror = () => reject(req.error);
			})
	);
}

async function getOrCreateMaster() {
	const existing = await idbGet(KEYS_STORE, MASTER_ID);
	if (existing && existing.cryptoKey) return existing.cryptoKey;
	const master = await crypto.subtle.generateKey(ALGO, false, KEY_USAGE_MASTER);
	await idbPut(KEYS_STORE, { id: MASTER_ID, cryptoKey: master, createdAt: Date.now() });
	return master;
}

async function loadMaster() {
	const record = await idbGet(KEYS_STORE, MASTER_ID);
	return record ? record.cryptoKey : null;
}

function randomIv() {
	return crypto.getRandomValues(new Uint8Array(12));
}

export async function hasKey() {
	const record = await idbGet(SECRETS_STORE, SECRET_ID);
	return Boolean(record);
}

export async function getStatus() {
	const record = await idbGet(SECRETS_STORE, SECRET_ID);
	if (!record) return { set: false };
	return {
		set: true,
		createdAt: record.createdAt || null,
		origin: record.origin || null,
	};
}

export async function setKey(plaintext) {
	const trimmed = String(plaintext || "").trim();
	if (!trimmed) throw new Error("API key cannot be empty.");

	const master = await getOrCreateMaster();
	const dataKey = await crypto.subtle.generateKey(ALGO, true, KEY_USAGE_DATA);

	const wrapIv = randomIv();
	const wrappedDataKey = await crypto.subtle.wrapKey("raw", dataKey, master, {
		name: "AES-GCM",
		iv: wrapIv,
	});

	const encoder = new TextEncoder();
	const plaintextBuf = encoder.encode(trimmed);
	const dataIv = randomIv();
	const ciphertext = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv: dataIv },
		dataKey,
		plaintextBuf
	);

	// Zero the encoded plaintext copy. The original string remains as an
	// argument on the caller's stack — caller is responsible for clearing
	// the input field after this resolves.
	plaintextBuf.fill(0);

	await idbPut(SECRETS_STORE, {
		id: SECRET_ID,
		wrappedDataKey,
		wrapIv,
		ciphertext,
		dataIv,
		createdAt: Date.now(),
		origin: location.origin,
	});
}

export async function removeKey({ wipeDevice = false } = {}) {
	await idbDelete(SECRETS_STORE, SECRET_ID);
	if (wipeDevice) await idbDelete(KEYS_STORE, MASTER_ID);
}

async function decryptKey() {
	const record = await idbGet(SECRETS_STORE, SECRET_ID);
	if (!record) throw new Error("No API key is set.");
	if (record.origin && record.origin !== location.origin) {
		throw new Error("Stored key origin does not match current origin.");
	}
	const master = await loadMaster();
	if (!master) throw new Error("Device master key missing — remove and re-set the API key.");

	const dataKey = await crypto.subtle.unwrapKey(
		"raw",
		record.wrappedDataKey,
		master,
		{ name: "AES-GCM", iv: record.wrapIv },
		ALGO,
		false,
		KEY_USAGE_DATA
	);
	const buf = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: record.dataIv },
		dataKey,
		record.ciphertext
	);
	return new TextDecoder().decode(buf);
}

// Attach Authorization to a fetch init object without ever exposing the
// plaintext key to callers. Returns a fresh init with a Headers instance.
export async function authorize(init = {}) {
	const key = await decryptKey();
	const headers = new Headers(init.headers || {});
	headers.set("Authorization", `Bearer ${key}`);
	return { ...init, headers };
}
