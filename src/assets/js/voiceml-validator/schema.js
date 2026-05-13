// VoiceML element schema. Encodes the verb / noun structure of the
// XML-based voice markup so the validator can flag unknown elements
// and child elements that don't belong inside their parent.
//
// Kinds:
//   root  — must be the document root (<Response>).
//   verb  — top-level action element, child of <Response>.
//   noun  — nested element that further qualifies a verb (e.g. <Number>
//           inside <Dial>).
//   ssml  — speech-markup element valid inside <Say>.

export const ROOT = "Response";

const SSML_CHILDREN = [
	"break",
	"emphasis",
	"lang",
	"p",
	"phoneme",
	"prosody",
	"s",
	"say-as",
	"sub",
	"w",
];

const ELEMENTS = {
	Response: { kind: "root", children: null },

	Connect: {
		kind: "verb",
		children: [
			"VirtualAgent",
			"Conversation",
			"ConversationRelay",
			"Stream",
			"Room",
			"Autopilot",
		],
	},
	Dial: {
		kind: "verb",
		children: ["Number", "Client", "Sip", "Conference", "Queue", "Sim", "Application", "Refer"],
	},
	Echo: { kind: "verb", children: [] },
	Enqueue: { kind: "verb", children: ["Task"] },
	Gather: { kind: "verb", children: ["Say", "Play", "Pause"] },
	Hangup: { kind: "verb", children: [] },
	Leave: { kind: "verb", children: [] },
	Pause: { kind: "verb", children: [] },
	Pay: { kind: "verb", children: ["Parameter", "Prompt"] },
	Play: { kind: "verb", children: [] },
	Prompt: { kind: "verb", children: ["Say", "Play", "Pause"] },
	Record: { kind: "verb", children: [] },
	Redirect: { kind: "verb", children: [] },
	Refer: { kind: "verb", children: ["Sip"] },
	Reject: { kind: "verb", children: [] },
	Say: { kind: "verb", children: SSML_CHILDREN },
	Start: { kind: "verb", children: ["Stream", "Siprec", "Transcription"] },
	Stop: { kind: "verb", children: ["Stream", "Siprec", "Transcription"] },

	Number: { kind: "noun", children: [] },
	Client: { kind: "noun", children: ["Identity", "Parameter"] },
	Sip: { kind: "noun", children: ["Headers", "Header"] },
	Conference: { kind: "noun", children: [] },
	Queue: { kind: "noun", children: [] },
	Sim: { kind: "noun", children: [] },
	Application: { kind: "noun", children: ["ApplicationSid", "Parameter"] },
	Task: { kind: "noun", children: [] },

	VirtualAgent: { kind: "noun", children: ["Parameter"] },
	Conversation: { kind: "noun", children: ["Parameter"] },
	ConversationRelay: { kind: "noun", children: ["Parameter", "Language"] },
	Room: { kind: "noun", children: [] },
	Autopilot: { kind: "noun", children: ["Parameter"] },
	Stream: { kind: "noun", children: ["Parameter"] },
	Siprec: { kind: "noun", children: ["Parameter"] },
	Transcription: { kind: "noun", children: ["Parameter"] },

	Parameter: { kind: "noun", children: [] },
	Identity: { kind: "noun", children: [] },
	Header: { kind: "noun", children: [] },
	Headers: { kind: "noun", children: ["Header"] },
	Language: { kind: "noun", children: [] },
	ApplicationSid: { kind: "noun", children: [] },

	break: { kind: "ssml", children: [] },
	emphasis: { kind: "ssml", children: SSML_CHILDREN },
	lang: { kind: "ssml", children: SSML_CHILDREN },
	p: { kind: "ssml", children: SSML_CHILDREN },
	phoneme: { kind: "ssml", children: [] },
	prosody: { kind: "ssml", children: SSML_CHILDREN },
	s: { kind: "ssml", children: SSML_CHILDREN },
	"say-as": { kind: "ssml", children: [] },
	sub: { kind: "ssml", children: [] },
	w: { kind: "ssml", children: SSML_CHILDREN },
};

// Response can contain any verb.
ELEMENTS.Response.children = Object.entries(ELEMENTS)
	.filter(([, def]) => def.kind === "verb")
	.map(([name]) => name);

export const SCHEMA = ELEMENTS;

export function knownElements() {
	return new Set(Object.keys(ELEMENTS));
}

export function lookup(name) {
	return ELEMENTS[name] || null;
}

export function isVerb(name) {
	const e = ELEMENTS[name];
	return !!(e && e.kind === "verb");
}

export function isNoun(name) {
	const e = ELEMENTS[name];
	return !!(e && (e.kind === "noun" || e.kind === "ssml"));
}
