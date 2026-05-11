// Master FAQ source. /faq/ renders both the visible page and the FAQPage
// JSON-LD from this file. Per-product pages keep their own inline FAQs in
// sync (per owner directive 2026-05-09 — duplication is intentional).
//
// `categories` drives the visible page layout.
// `flat` is the same list flattened, used by the JSON-LD loop so it can use a
// simple `loop.last` for comma handling.
//
// Each item: { q, a, plain }. `plain` is optional and provides a
// link-stripped version of `a` for the JSON-LD acceptedAnswer.text field;
// if omitted, `a` is used directly.

const categories = [
	{
		id: "general",
		label: "General",
		items: [
			{
				q: "Is VoiceTel only for developers?",
				a: "No. VoiceTel serves developers, telecom engineers, operators, and business buyers across Programmable Voice, Voice Calling, messaging, SIP trunking, numbers, hosted PBX, and phone applications.",
			},
			{
				q: "Do calculator inputs leave the browser?",
				a: "No. The calculator states that usage inputs remain client-side.",
			},
		],
	},
	{
		id: "voice",
		label: "Voice",
		items: [
			{
				q: "Can existing Twilio voice applications migrate?",
				a: 'Yes, when they stay within the supported VoiceML-compatible voice surface. Review the <a href="/voiceml/compatibility/">compatibility matrix</a> and the <a href="/voiceml/migrate/">migration guide</a> before production cutover.',
				plain: "Yes, when they stay within the supported VoiceML-compatible voice surface. Review the compatibility matrix and the migration guide before production cutover.",
			},
			{
				q: "Does VoiceTel provide speech services directly?",
				a: "<p>Speech services are positioned as configurable or bring-your-own unless a specific managed VoiceTel bundle is confirmed. BYO services include:</p><ul><li>OpenAI TTS</li><li>Amazon Polly</li><li>Google Cloud TTS</li><li>ElevenLabs</li><li>Azure Cognitive Services</li></ul><p>VoiceTel also provides mod_flite (FreeSWITCH bundled) as the system default at no charge.</p>",
				plain: "Speech services are positioned as configurable or bring-your-own unless a specific managed VoiceTel bundle is confirmed. BYO services include OpenAI TTS, Amazon Polly, Google Cloud TTS, ElevenLabs, and Azure Cognitive Services. VoiceTel also provides mod_flite (FreeSWITCH bundled) as the system default at no charge.",
			},
			{
				q: "How are voice rates displayed?",
				a: 'Current public rates are on the <a href="/pricing/">pricing page</a>, with a calculator that applies volume-tier discounts. Your customer portal displays the same rates plus any account-specific contract pricing.',
			},
		],
	},
	{
		id: "messaging",
		label: "Messaging",
		items: [
			{
				q: "Does VoiceTel handle A2P 10DLC?",
				a: "Yes. VoiceTel supports A2P 10DLC workflows. Registration, vetting, campaign approval, fees, and ownership are described precisely in onboarding and service terms. The 10DLC application and any associated fees are the sole responsibility of the customer.",
			},
			{
				q: "Are carrier fees included?",
				a: "Carrier pass-through fees are listed separately from base message prices unless pricing data explicitly includes them.",
			},
			{
				q: "Can high-volume senders get dedicated SMPP binds for increased capacity?",
				a: "Yes. Speak with your messaging specialist to discuss your use case.",
			},
			{
				q: "Can VoiceTel handle traffic for phone numbers it doesn't own?",
				a: "Yes. With a Letter of Authorization (LOA), we can SMS-enable any phone number.",
			},
			{
				q: "Who pays for compliance?",
				a: "10DLC brand registration, campaign filing, and any associated fees are the sole responsibility of the customer. VoiceTel supports A2P 10DLC workflows as the messaging transport — registration, vetting, campaign approval, fees, and ownership are described precisely in onboarding and service terms.",
			},
		],
	},
	{
		id: "numbers",
		label: "Numbers",
		items: [
			{
				q: "Can I port my number to your service?",
				a: "Yes. We can port most North American phone numbers, provided the number is eligible for porting. If your number is portable, we can help transfer it to our service.",
			},
		],
	},
	{
		id: "hosted-pbx",
		label: "Hosted PBX",
		items: [
			{
				q: "Can we keep existing desk phones?",
				a: "Device compatibility depends on SIP support, firmware, provisioning, and security policy. Bring your own device is allowed, but its management, configuration, and support are solely the customer's responsibility. We highly recommend using VoiceTel devices and software applications.",
			},
			{
				q: "Can hosted PBX use VoiceTel numbers?",
				a: "Yes, numbers and emergency-service records are managed through the VoiceTel number workflow. The PBX product requires at least one emergency number per physical address.",
			},
		],
	},
	{
		id: "pricing",
		label: "Pricing & rates",
		items: [
			{
				q: "Are VoiceTel rates public?",
				a: "VoiceTel publishes approved public rates when available. Account-specific rates are labeled custom or handled through sales.",
			},
		],
	},
	{
		id: "emergency",
		label: "Emergency services",
		items: [
			{
				q: "Does VoiceTel support emergency calling?",
				a: 'Emergency-service availability and limitations depend on number type, service address, product configuration, and signed terms. The <a href="/legal/">legal page</a> and service terms explain those limitations.',
				plain: "Emergency-service availability and limitations depend on number type, service address, product configuration, and signed terms. The legal page and service terms explain those limitations.",
			},
			{
				q: "Can I dial 911 for emergency services?",
				a: 'Emergency-service availability depends on number type, service address, product configuration, and signed terms. See the <a href="/legal/">legal page</a> for the full E911 limitations.',
				plain: "Emergency-service availability depends on number type, service address, product configuration, and signed terms. See the legal page for the full E911 limitations.",
			},
		],
	},
	{
		id: "kyc",
		label: "KYC & verification",
		items: [
			{
				q: "What is KYC and why does VoiceTel require it?",
				a: "Know Your Customer (KYC) verification confirms the identity of every account holder before service is activated. It is required by federal regulation and by the underlying carriers VoiceTel routes through, and it helps prevent fraud, illegal robocalling, and caller-ID spoofing.",
			},
			{
				q: "What documents do I need to provide?",
				a: 'A valid government-issued photo ID, a recent utility or mobile-telephone bill for address verification, a photo of you holding the same ID, and a signed certification describing the documents and the nature of traffic you intend to send. <a href="/signup/">See the signup page</a> for the full list.',
				plain: "A valid government-issued photo ID, a recent utility or mobile-telephone bill for address verification, a photo of you holding the same ID, and a signed certification describing the documents and the nature of traffic you intend to send. See the signup page for the full list.",
			},
			{
				q: "Can I use the platform before KYC is complete?",
				a: "No. Outbound calling, messaging, and number provisioning are gated behind account activation, which requires a completed KYC review.",
			},
			{
				q: "What happens if my documents are rejected?",
				a: "You will receive instructions through the customer portal explaining what to resubmit. Common reasons include expired IDs, illegible photos, address mismatches, and missing signatures on the certification document.",
			},
			{
				q: "Do business accounts need different documentation?",
				a: 'Business accounts also need formation documents (articles of incorporation or equivalent) and authorization for the account signer. <a href="/contact/">Contact support</a> with your business profile so we can route you to the correct intake.',
				plain: "Business accounts also need formation documents (articles of incorporation or equivalent) and authorization for the account signer. Contact support with your business profile so we can route you to the correct intake.",
			},
			{
				q: "Is my submitted documentation kept private?",
				a: "KYC documents are accessed only by authorized VoiceTel compliance staff and retained per applicable record-keeping requirements. They are not shared with third parties except when required by law.",
			},
		],
	},
	{
		id: "account",
		label: "Account & activation",
		items: [
			{
				q: "How can I find my lost account information?",
				a: 'Please use our <a href="https://www.voicetel.com/?recovery">account recovery tool</a> which emails your lost account information to the account holder. We recommend you immediately change your password in the control panel after recovery.',
				plain: "Please use our account recovery tool which emails your lost account information to the account holder. We recommend you immediately change your password in the control panel after recovery.",
			},
			{
				q: "I can log into the Control Panel but cannot utilize the service. What's wrong?",
				a: "Shortly after signup you received an email providing instructions on enabling your account. Please check your inbox and explicitly follow the instructions contained within the account activation email.",
			},
			{
				q: "Why did the service stop working?",
				a: "Please ensure that you have available funds in your account. VoiceTel is a prepaid service. If your balance goes below zero, your account will be temporarily suspended.",
			},
			{
				q: 'I received "Incorrect or Expired Pin" text during the activation process.',
				a: "The pin is case and time sensitive. Please verify your mobile number immediately after receiving the account activation email.",
			},
			{
				q: 'I received "Manual Verification Required" text during the activation process.',
				a: "We'll need additional information from you. Please obtain copies of your current utility or phone bill along with matching photo identification. You'll then need to provide this documentation to <a href=\"https://www.voicetel.com/#support\">customer support</a> to manually validate your account.",
				plain: "We'll need additional information from you. Please obtain copies of your current utility or phone bill along with matching photo identification. You'll then need to provide this documentation to customer support to manually validate your account.",
			},
		],
	},
];

export default {
	categories,
	flat: categories.flatMap((cat) => cat.items),
};
