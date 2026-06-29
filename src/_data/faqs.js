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
				q: "What is VoiceTel?",
				a: 'VoiceTel is a telecommunications platform for teams that need real carrier services, programmable voice, messaging, numbers, SIP trunking, Hosted PBX, lookup APIs, and operational support from people who understand the network. Developers can use <a href="/voiceml/">VoiceML</a> and the <a href="/docs/api/">REST APIs</a>. Operators and integrators can use SIP trunks, the <a href="/sdn/">SDN appliance</a>, Hosted PBX, numbers, messaging, and carrier-grade routing tools.',
				plain: "VoiceTel is a telecommunications platform for teams that need real carrier services, programmable voice, messaging, numbers, SIP trunking, Hosted PBX, lookup APIs, and operational support from people who understand the network. Developers can use VoiceML and the REST APIs. Operators and integrators can use SIP trunks, the SDN appliance, Hosted PBX, numbers, messaging, and carrier-grade routing tools.",
			},
			{
				q: "Who is VoiceTel built for?",
				a: 'Developers, telecom engineers, MSPs, resellers, operators, and business buyers. The product surface is strongest for technical buyers, integrators, and businesses with real telecom needs. See the dedicated landing pages: <a href="/developers/">For developers</a>, <a href="/integrators/">For integrators and resellers</a>, <a href="/enterprise/">For larger organizations</a>.',
				plain: "Developers, telecom engineers, MSPs, resellers, operators, and business buyers. The product surface is strongest for technical buyers, integrators, and businesses with real telecom needs.",
			},
			{
				q: "Is VoiceTel a carrier, CPaaS provider, SIP trunk provider, or PBX provider?",
				a: 'All of those, layered together. VoiceTel operates carrier services and exposes them through <a href="/voice/">wholesale voice</a>, programmable voice (<a href="/voiceml/">VoiceML</a>), <a href="/sip-trunking/">SIP trunks</a>, <a href="/messaging/">messaging</a>, <a href="/numbers/">numbers</a>, lookups (<a href="/caller-lookup/">Caller</a> and <a href="/carrier-lookup/">Carrier</a>), <a href="/pbx/">Hosted PBX</a>, and <a href="/phone/">phone applications</a> under one account.',
				plain: "All of those, layered together. VoiceTel operates carrier services and exposes them through wholesale voice, programmable voice (VoiceML), SIP trunks, messaging, numbers, lookups, Hosted PBX, and phone applications under one account.",
			},
			{
				q: "What is the difference between VoiceML, SIP Trunking, and Hosted PBX?",
				a: '<strong>VoiceML</strong> is for programmable call flows controlled by XML and webhooks. <strong>SIP Trunking</strong> connects your existing PBX, SBC, contact center, or voice platform to VoiceTel for inbound and outbound calling. <strong>Hosted PBX</strong> is a VoiceTel-managed business phone system with users, extensions, devices, call routing, voicemail, and apps. See <a href="/voiceml/">VoiceML</a>, <a href="/sip-trunking/">SIP trunking</a>, and <a href="/pbx/">Hosted PBX</a> for product details.',
				plain: "VoiceML is for programmable call flows controlled by XML and webhooks. SIP Trunking connects your existing PBX, SBC, contact center, or voice platform to VoiceTel for inbound and outbound calling. Hosted PBX is a VoiceTel-managed business phone system with users, extensions, devices, call routing, voicemail, and apps.",
			},
		],
	},
	{
		id: "pricing",
		label: "Pricing, billing & contract rates",
		items: [
			{
				q: "Are VoiceTel public rates final rates?",
				a: 'VoiceTel publishes list rates where available. The <a href="/pricing/">pricing calculator</a> can model estimated monthly spend, but final account pricing depends on KYC verification, capacity review, usage profile, and contract terms. Your customer portal displays the rates that apply to your account.',
				plain: "VoiceTel publishes list rates where available. The pricing calculator can model estimated monthly spend, but final account pricing depends on KYC verification, capacity review, usage profile, and contract terms. Your customer portal displays the rates that apply to your account.",
			},
			{
				q: "How do volume discounts and custom contract rates work?",
				a: 'Volume pricing is based on real usage, service mix, capacity requirements, destination profile, minimum commitments, and contract terms. The <a href="/pricing/">public calculator</a> and posted line items are useful for modeling. Final rates are confirmed after VoiceTel reviews the workload and account requirements.',
				plain: "Volume pricing is based on real usage, service mix, capacity requirements, destination profile, minimum commitments, and contract terms. The public calculator and posted line items are useful for modeling. Final rates are confirmed after VoiceTel reviews the workload and account requirements.",
			},
			{
				q: "What fees are outside the pricing calculator?",
				a: 'The calculator may not include taxes, regulatory charges, carrier pass-through fees, registry fees, <a href="/support/messaging/10dlc/">10DLC</a> campaign fees, payment processor fees, third-party speech providers, third-party storage providers, or account-specific contract terms. For production workloads, use the calculator as a model and confirm final pricing with VoiceTel.',
				plain: "The calculator may not include taxes, regulatory charges, carrier pass-through fees, registry fees, 10DLC campaign fees, payment processor fees, third-party speech providers, third-party storage providers, or account-specific contract terms. For production workloads, use the calculator as a model and confirm final pricing with VoiceTel.",
			},
			{
				q: "Do calculator inputs leave the browser?",
				a: 'No. The <a href="/pricing/">pricing calculator</a> states that usage inputs remain client-side.',
				plain: "No. The pricing calculator states that usage inputs remain client-side.",
			},
			{
				q: "Are A2P 10DLC fees included in message pricing?",
				a: 'No. Carrier, registry, and pass-through fees for <a href="/support/messaging/10dlc/">A2P 10DLC</a> are listed separately from the base <a href="/messaging/">messaging</a> segment rate. Plan for them as a distinct line item.',
				plain: "No. Carrier, registry, and pass-through fees for A2P 10DLC are listed separately from the base messaging segment rate. Plan for them as a distinct line item.",
			},
			{
				q: "Does VoiceTel mark up STT, TTS, or storage vendors?",
				a: "No. Free defaults — English speech-to-text and built-in text-to-speech voices — ship with every account at no charge. When you pick a specific vendor for production (Deepgram, AWS, Azure, ElevenLabs, S3, etc.), you sign up with them and pay them directly. VoiceTel does not insert a platform markup on top of those third-party costs.",
			},
			{
				q: "What happens if my prepaid balance reaches zero?",
				a: "VoiceTel is a prepaid service. If your balance goes below zero, services are disabled until funds are added.",
			},
		],
	},
	{
		id: "account",
		label: "Account, KYC & activation",
		items: [
			{
				q: "Why does VoiceTel require KYC?",
				a: "VoiceTel requires KYC before enabling production network access because voice, messaging, numbers, and emergency services can be abused if accounts are not verified. KYC helps protect customers, carriers, recipients, emergency-service systems, and the VoiceTel network from fraud, impersonation, spam, and unauthorized use.",
			},
			{
				q: "What documents do I need to provide?",
				a: "For an individual account: name, physical address, and active telephone number — each with a supporting record (government identification, lease, utility statement, or similar); a description of goods or services offered, with verification of commercial presence (website, social-media account, or store front); and a contractual certification that the customer has not been the subject of an adverse final determination for violating state or federal robocall rules. Documents must be clear, current, and match the account name.",
			},
			{
				q: "Do business accounts need different documentation?",
				a: "Yes. For a partnership or corporate account, VoiceTel collects legal business name, place of formation, proof of good standing dated within the last six months, U.S. Employer Identification Number or Business Registration Number where applicable, physical business address, and active telephone number — each with supporting records. The account also needs a description of goods or services offered with verification of commercial presence (website, social-media account, or store front), the name of the individual authorized to act on behalf of the customer, evidence of that authority (letter of authority, board minutes, or contractual representation and warranty), and the same contractual certification that the customer has not been the subject of an adverse final determination for violating state or federal robocall rules.",
			},
			{
				q: "Can I use the platform before KYC is complete?",
				a: "Some account exploration is available pre-KYC, but production traffic — calling, messaging, number provisioning, and emergency-service registration — is gated on a completed KYC review.",
			},
			{
				q: "What happens if my documents are rejected?",
				a: "Common rejection reasons are an expired ID, an illegible photo, an address mismatch, a missing signature, or an unverifiable business. Re-submit clear, current documents that match the account name and address.",
			},
			{
				q: "Can VoiceTel decline a KYC application that meets all documentation requirements?",
				a: "Yes. Meeting the documentation requirements is necessary but not sufficient. VoiceTel may decline any application at its discretion based on risk review, traffic-pattern analysis, downstream-carrier or registry constraints, prior compliance history, or any other factor VoiceTel determines relevant to network integrity, fraud prevention, or regulatory exposure. VoiceTel is not obligated to disclose the basis for a decline.",
			},
			{
				q: "Can service be suspended after approval?",
				a: "Yes. VoiceTel may suspend or restrict service for non-payment, fraud indicators, abusive traffic, invalid compliance information, regulatory risk, network-integrity issues, or violation of applicable terms. If service is restricted, review the notice in your account or contact support with the requested documentation.",
			},
			{
				q: "Is my submitted documentation kept private?",
				a: "Yes. KYC documents are used for verification and compliance and are not shared beyond what is required for account review and regulatory obligations.",
			},
			{
				q: "How can I find my lost account information?",
				a: 'Use <a href="https://www.voicetel.com/?recovery" rel="external">account recovery</a> on the portal to reset access to a known email address.',
				plain: "Use account recovery on the portal to reset access to a known email address.",
			},
			{
				q: 'I received "Incorrect or Expired Pin" text during the activation process.',
				a: "The pin is case-sensitive and time-sensitive. Verify your mobile number immediately after receiving the account activation email.",
			},
			{
				q: 'I received "Manual Verification Required" text during the activation process.',
				a: 'VoiceTel needs additional information. Obtain copies of your current utility or phone bill along with matching photo identification, then provide that documentation to <a href="https://www.voicetel.com/#support">customer support</a> to manually validate your account.',
				plain: "VoiceTel needs additional information. Obtain copies of your current utility or phone bill along with matching photo identification, then provide that documentation to customer support to manually validate your account.",
			},
		],
	},
	{
		id: "voice",
		label: "Wholesale Voice",
		items: [
			{
				q: "What is voice origination?",
				a: "Voice origination is inbound calling from the public telephone network to your VoiceTel account. When someone calls a phone number assigned to your account and VoiceTel delivers that call to your SIP trunk, VoiceML application, Hosted PBX, or routing destination, that is origination.",
			},
			{
				q: "What is voice termination?",
				a: "Voice termination is outbound calling from your VoiceTel account to the public telephone network. When your PBX, application, or SIP platform sends a call to VoiceTel and VoiceTel routes it to the destination carrier, that is termination.",
			},
			{
				q: "How are voice rates displayed?",
				a: 'Public voice rates are list rates and appear on the <a href="/pricing/">pricing page</a> and in the calculator. Account-specific tiers or contract rates are confirmed after capacity review and shown in the customer portal once provisioning completes.',
				plain: "Public voice rates are list rates and appear on the pricing page and in the calculator. Account-specific tiers or contract rates are confirmed after capacity review and shown in the customer portal once provisioning completes.",
			},
			{
				q: "Does VoiceTel provide speech services directly?",
				a: "VoiceTel ships free defaults so prototyping starts immediately — a built-in English speech-to-text engine and a small set of built-in TTS voices. For production, you choose the vendor that fits your accuracy, latency, language, and data-handling requirements; VoiceTel runs the carrier and call-control layer and the vendor bills you directly with no platform markup. The flexibility to pick the right engine is a deliberate platform strength.",
			},
			{
				q: "Can VoiceTel help with calls marked spam or scam likely?",
				a: 'VoiceTel can help review caller identity, STIR/SHAKEN signing, <a href="/caller-lookup/">CNAM</a> records, number usage patterns, and carrier response data. No carrier can guarantee that every analytics provider or mobile carrier will remove a spam or scam label immediately. Remediation depends on traffic history, caller behavior, analytics vendors, and downstream <a href="/support/voice/compliance/">carrier policies</a>.',
				plain: "VoiceTel can help review caller identity, STIR/SHAKEN signing, CNAM records, number usage patterns, and carrier response data. No carrier can guarantee that every analytics provider or mobile carrier will remove a spam or scam label immediately. Remediation depends on traffic history, caller behavior, analytics vendors, and downstream carrier policies.",
			},
		],
	},
	{
		id: "sip",
		label: "SIP trunking",
		items: [
			{
				q: "Do you support registration and IP authentication?",
				a: 'Yes. VoiceTel can support SIP registration and IP authentication depending on the account, trunk type, and network design. SIP registration is useful when a PBX or device registers to VoiceTel with credentials. IP authentication is better for controlled <a href="/pbx/">PBX</a>, SBC, carrier, and contact-center environments where traffic comes from known static IP addresses. See the <a href="/sip-trunking/">SIP trunking</a> product page for the wholesale trunk options.',
				plain: "Yes. VoiceTel can support SIP registration and IP authentication depending on the account, trunk type, and network design. SIP registration is useful when a PBX or device registers to VoiceTel with credentials. IP authentication is better for controlled PBX, SBC, carrier, and contact-center environments where traffic comes from known static IP addresses. See the SIP trunking product page for the wholesale trunk options.",
			},
			{
				q: "Why do I have one-way audio?",
				a: 'One-way audio is usually caused by NAT, firewall policy, SIP ALG, RTP pinholes, codec negotiation, or direct-media behavior. Send <a href="/contact/">support</a> the call timestamp, calling number, called number, SIP Call-ID, SIP trace, and any RTP capture available from your PBX or SBC. The <a href="/support/voice/firewall/">router and firewall guides</a> cover the common SIP ALG and NAT fixes.',
				plain: "One-way audio is usually caused by NAT, firewall policy, SIP ALG, RTP pinholes, codec negotiation, or direct-media behavior. Send support the call timestamp, calling number, called number, SIP Call-ID, SIP trace, and any RTP capture available from your PBX or SBC. The router and firewall guides cover the common SIP ALG and NAT fixes.",
			},
			{
				q: "What should I send support when a SIP call fails?",
				a: 'For the fastest review, send the call direction, timestamp with timezone, calling number, called number, SIP Call-ID, response code, SIP trace, and a short description of the expected behavior. For audio issues, include RTP details or a packet capture if available. Reach the team at <a href="/contact/">contact</a>.',
				plain: "For the fastest review, send the call direction, timestamp with timezone, calling number, called number, SIP Call-ID, response code, SIP trace, and a short description of the expected behavior. For audio issues, include RTP details or a packet capture if available. Reach the team at contact.",
			},
		],
	},
	{
		id: "voiceml",
		label: "VoiceML & Twilio migration",
		items: [
			{
				q: "What is VoiceML?",
				a: '<a href="/voiceml/">VoiceML</a> is VoiceTel\'s XML-based programmable voice runtime. It lets your application control calls with markup, webhooks, recordings, conferences, queues, prompts, and call-control instructions. It is designed for teams that want programmable voice without giving up carrier-grade routing, SIP visibility, and operational support.',
				plain: "VoiceML is VoiceTel's XML-based programmable voice runtime. It lets your application control calls with markup, webhooks, recordings, conferences, queues, prompts, and call-control instructions. It is designed for teams that want programmable voice without giving up carrier-grade routing, SIP visibility, and operational support.",
			},
			{
				q: "Can existing Twilio voice applications migrate?",
				a: 'Often, yes. If your application uses supported voice verbs, callbacks, parameters, and webhook patterns, you may be able to migrate by changing endpoints, credentials, and configuration instead of rewriting the call flow. Not every Twilio feature maps 1:1. Test one production call path first, compare callback behavior, and confirm unsupported verbs or attributes against the <a href="/voiceml/compatibility/">compatibility matrix</a> before cutover.',
				plain: "Often, yes. If your application uses supported voice verbs, callbacks, parameters, and webhook patterns, you may be able to migrate by changing endpoints, credentials, and configuration instead of rewriting the call flow. Not every Twilio feature maps 1:1. Test one production call path first, compare callback behavior, and confirm unsupported verbs or attributes against the compatibility matrix before cutover.",
			},
			{
				q: "Which Twilio features are not supported?",
				a: 'VoiceTel\'s compatibility layer is focused on supported programmable voice workloads. Some Twilio products, verbs, attributes, or non-voice APIs may not be implemented. Before migration, compare your application against the <a href="/voiceml/compatibility/">VoiceML compatibility matrix</a> and test the exact call flows you plan to move.',
				plain: "VoiceTel's compatibility layer is focused on supported programmable voice workloads. Some Twilio products, verbs, attributes, or non-voice APIs may not be implemented. Before migration, compare your application against the VoiceML compatibility matrix and test the exact call flows you plan to move.",
			},
			{
				q: "How do I validate my VoiceML markup before going live?",
				a: 'Paste your response markup into the <a href="/voiceml/validator/">VoiceML validator</a>. It runs entirely in your browser, confirms the document is well-formed XML, and flags any element that is not a known verb or noun.',
				plain: "Paste your response markup into the VoiceML validator. It runs entirely in your browser, confirms the document is well-formed XML, and flags any element that is not a known verb or noun.",
			},
			{
				q: "Which text-to-speech providers does VoiceTel support?",
				a: 'Supported text-to-speech integrations. Open-source engines run on VoiceTel infrastructure; cloud vendors are billed by you directly. <a href="https://github.com/rhasspy/piper" rel="external">Piper</a> and <a href="https://github.com/coqui-ai/TTS" rel="external">Coqui TTS</a> are open-source and self-hosted. <a href="https://platform.openai.com/signup" rel="external">OpenAI TTS</a>, <a href="https://aws.amazon.com/polly/" rel="external">Amazon Polly</a>, and <a href="https://azure.microsoft.com/products/ai-services/ai-speech" rel="external">Azure AI Speech</a> are cloud vendors you sign up for and pay directly.',
				plain: "Supported text-to-speech integrations. Open-source engines run on VoiceTel infrastructure; cloud vendors are billed by you directly. Piper and Coqui TTS are open-source and self-hosted. OpenAI TTS, Amazon Polly, and Azure AI Speech are cloud vendors you sign up for and pay directly.",
			},
			{
				q: "Which speech-to-text providers does VoiceTel support?",
				a: 'English calls have a free VoiceTel STT default for quick starts. For production — or for any non-English call — pick the vendor that\'s right for your accuracy, latency, language, and data-handling needs, and pay them directly with no VoiceTel markup. Supported integrations: <a href="https://console.deepgram.com/signup" rel="external">Deepgram</a>, <a href="https://cloud.google.com/speech-to-text" rel="external">Google Cloud Speech-to-Text</a>, <a href="https://aws.amazon.com/transcribe/" rel="external">AWS Transcribe</a>, and <a href="https://azure.microsoft.com/products/ai-services/ai-speech" rel="external">Azure AI Speech</a>.',
				plain: "English calls have a free VoiceTel STT default for quick starts. For production — or for any non-English call — pick the vendor that's right for your accuracy, latency, language, and data-handling needs, and pay them directly with no VoiceTel markup. Supported integrations: Deepgram, Google Cloud Speech-to-Text, AWS Transcribe, and Azure AI Speech.",
			},
		],
	},
	{
		id: "messaging",
		label: "Messaging, 10DLC & toll-free verification",
		items: [
			{
				q: "Does VoiceTel support A2P 10DLC?",
				a: 'Yes. <a href="/messaging/">VoiceTel Messaging</a> supports <a href="/support/messaging/10dlc/">A2P 10DLC</a> workflows for business SMS and MMS traffic. Customers are responsible for accurate brand and campaign information, required disclosures, opt-in records, carrier or registry fees, and ongoing <a href="/support/messaging/compliance/">compliance</a>. VoiceTel can help review the filing before submission, but approval is controlled by the registry, carriers, and downstream reviewers.',
				plain: "Yes. VoiceTel Messaging supports A2P 10DLC workflows for business SMS and MMS traffic. Customers are responsible for accurate brand and campaign information, required disclosures, opt-in records, carrier or registry fees, and ongoing compliance. VoiceTel can help review the filing before submission, but approval is controlled by the registry, carriers, and downstream reviewers.",
			},
			{
				q: "Can VoiceTel guarantee 10DLC approval?",
				a: 'No. VoiceTel can help identify common rejection risks and prepare cleaner <a href="/support/messaging/10dlc/">10DLC</a> submissions, but final approval is controlled by the registry, carriers, and downstream reviewers. Campaigns may be rejected for unverifiable business information, weak opt-in evidence, missing disclosures, prohibited content, public URL shorteners, mismatched sample messages, or use cases that do not match the sender\'s website or business model. The <a href="/support/messaging/checklist/">readiness checklist</a> covers the common pre-flight fixes.',
				plain: "No. VoiceTel can help identify common rejection risks and prepare cleaner 10DLC submissions, but final approval is controlled by the registry, carriers, and downstream reviewers. Campaigns may be rejected for unverifiable business information, weak opt-in evidence, missing disclosures, prohibited content, public URL shorteners, mismatched sample messages, or use cases that do not match the sender's website or business model. The readiness checklist covers the common pre-flight fixes.",
			},
			{
				q: "Who is responsible for 10DLC registration, fees, and compliance?",
				a: 'The customer. VoiceTel provides the platform and supports the filing workflow, but the customer is responsible for accurate brand information, campaign use case, opt-in evidence, consumer disclosures, carrier and registry fees, and ongoing compliance with CTIA and FCC rules. See the <a href="/support/messaging/compliance/">messaging compliance guide</a> for the operational details.',
				plain: "The customer. VoiceTel provides the platform and supports the filing workflow, but the customer is responsible for accurate brand information, campaign use case, opt-in evidence, consumer disclosures, carrier and registry fees, and ongoing compliance with CTIA and FCC rules.",
			},
			{
				q: "Why are my messages filtered?",
				a: 'Message filtering can happen even after registration. Common causes include content that does not match the approved campaign, missing consent, complaint activity, suspicious links, URL shorteners, prohibited content, high opt-out rates, or carrier-specific enforcement. See the <a href="/support/messaging/operating-rules/">operating rules</a> for the day-to-day expectations. Send <a href="/contact/">support</a> the message body, timestamp, destination number, originating number, campaign ID, delivery receipt, and any carrier error code.',
				plain: "Message filtering can happen even after registration. Common causes include content that does not match the approved campaign, missing consent, complaint activity, suspicious links, URL shorteners, prohibited content, high opt-out rates, or carrier-specific enforcement. See the operating rules for the day-to-day expectations. Send support the message body, timestamp, destination number, originating number, campaign ID, delivery receipt, and any carrier error code.",
			},
			{
				q: "Can high-volume senders get dedicated SMPP binds for increased capacity?",
				a: 'Yes &mdash; direct SMPP is available for high-volume traffic after compliance and use-case review. See <a href="/messaging/">Messaging</a> for product details.',
				plain: "Yes — direct SMPP is available for high-volume traffic after compliance and use-case review. See Messaging for product details.",
			},
			{
				q: "Can VoiceTel SMS-enable a number it does not carry for voice?",
				a: 'Yes. Hosted SMS allows you to keep voice with another carrier while VoiceTel handles <a href="/messaging/">messaging</a>, subject to authorization and number eligibility.',
				plain: "Yes. Hosted SMS allows you to keep voice with another carrier while VoiceTel handles messaging, subject to authorization and number eligibility.",
			},
			{
				q: "Are carrier fees included?",
				a: 'Carrier pass-through fees are listed separately from base <a href="/pricing/">messaging rates</a> so charges remain transparent.',
				plain: "Carrier pass-through fees are listed separately from base messaging rates so charges remain transparent.",
			},
		],
	},
	{
		id: "numbers",
		label: "Numbers, porting & SMS enablement",
		items: [
			{
				q: "Can I port numbers into VoiceTel?",
				a: 'Yes, when the numbers are portable and the losing carrier accepts the port request. Most porting delays are caused by mismatched account information, incorrect service address, missing PIN, pending orders, frozen accounts, or documents that do not match the losing carrier\'s records. The <a href="/support/voice/porting/procedure/">porting procedure</a> walks through what we need from you.',
				plain: "Yes, when the numbers are portable and the losing carrier accepts the port request. Most porting delays are caused by mismatched account information, incorrect service address, missing PIN, pending orders, frozen accounts, or documents that do not match the losing carrier's records. The porting procedure walks through what we need from you.",
			},
			{
				q: "Should I cancel service with my current carrier before porting?",
				a: "No. Keep the existing service active until the port completes. Canceling service too early can cause a port rejection, service interruption, or number recovery issue. Wait until the number is confirmed active on VoiceTel before closing the old account.",
			},
			{
				q: "Can I SMS-enable a number without porting voice?",
				a: 'Yes, in many cases. VoiceTel may be able to enable <a href="/messaging/">messaging</a> for a number while voice service remains with the existing carrier. SMS enablement usually requires authorization, number eligibility, and proof that you control the number.',
				plain: "Yes, in many cases. VoiceTel may be able to enable messaging for a number while voice service remains with the existing carrier. SMS enablement usually requires authorization, number eligibility, and proof that you control the number.",
			},
			{
				q: "Why was my port rejected?",
				a: "Common rejection reasons: name or address mismatch with the losing carrier's records, wrong account number, missing or incorrect PIN, a frozen account, a pending order on the number, or documentation that does not match the CSR. Fix the underlying mismatch and resubmit the port request. See <a href=\"/support/voice/porting/retrieving-pins/\">retrieving porting PINs</a> if that's the blocker.",
				plain: "Common rejection reasons: name or address mismatch with the losing carrier's records, wrong account number, missing or incorrect PIN, a frozen account, a pending order on the number, or documentation that does not match the CSR. Fix the underlying mismatch and resubmit the port request. See retrieving porting PINs if that's the blocker.",
			},
		],
	},
	{
		id: "emergency",
		label: "Emergency services / E911",
		items: [
			{
				q: "Can I dial 911 through VoiceTel?",
				a: "Yes, where emergency calling is enabled, configured, and supported for the number and service type. Emergency calling requires accurate registered address information. VoIP emergency calling can be affected by internet outages, power loss, incorrect address records, unsupported number types, routing misconfiguration, or use from a location different from the registered address.",
			},
			{
				q: "Do PBX users need separate emergency addresses?",
				a: "Usually, yes. If users are located at different physical addresses, each emergency-calling identity should be associated with the correct service location where supported. Customers are responsible for keeping emergency addresses accurate, especially for remote workers, branch offices, and users who move between locations.",
			},
		],
	},
	{
		id: "hosted-pbx",
		label: "Hosted PBX",
		items: [
			{
				q: "What is VoiceTel Hosted PBX?",
				a: 'VoiceTel <a href="/pbx/">Hosted PBX</a> is a managed phone system for businesses, resellers, and multi-location teams. It can include users, extensions, call routing, voicemail, ring groups, business hours, devices, apps, and VoiceTel network services for inbound and outbound calling.',
				plain: "VoiceTel Hosted PBX is a managed phone system for businesses, resellers, and multi-location teams. It can include users, extensions, call routing, voicemail, ring groups, business hours, devices, apps, and VoiceTel network services for inbound and outbound calling.",
			},
			{
				q: "Can we keep existing desk phones?",
				a: 'Often, yes, if the phones are SIP-compatible and can be provisioned for the VoiceTel environment. Support depends on the device model, firmware, provisioning method, network conditions, and whether the device is managed by VoiceTel or brought by the customer. See the per-vendor <a href="/support/voice/phone/">desk-phone setup guides</a>.',
				plain: "Often, yes, if the phones are SIP-compatible and can be provisioned for the VoiceTel environment. Support depends on the device model, firmware, provisioning method, network conditions, and whether the device is managed by VoiceTel or brought by the customer. See the per-vendor desk-phone setup guides.",
			},
			{
				q: "Can hosted PBX use VoiceTel numbers?",
				a: 'Yes. Hosted PBX uses VoiceTel-managed inbound and outbound calling and assigned <a href="/numbers/">phone numbers</a> natively.',
				plain: "Yes. Hosted PBX uses VoiceTel-managed inbound and outbound calling and assigned phone numbers natively.",
			},
		],
	},
	{
		id: "phone-apps",
		label: "VoiceTel Phone apps",
		items: [
			{
				q: "What is VoiceTel Phone?",
				a: 'VoiceTel <a href="/phone/">Phone</a> is a calling client for users who need access to VoiceTel voice services from a browser, desktop, or mobile device. Availability and features depend on the account, tenant, user configuration, and product plan.',
				plain: "VoiceTel Phone is a calling client for users who need access to VoiceTel voice services from a browser, desktop, or mobile device. Availability and features depend on the account, tenant, user configuration, and product plan.",
			},
		],
	},
	{
		id: "lookups",
		label: "Caller lookup & carrier lookup",
		items: [
			{
				q: "What is CNAM lookup?",
				a: 'CNAM lookup returns caller-name information associated with a telephone number when available from supported data sources. Results can help with caller display, call screening, fraud review, CRM enrichment, and routing decisions, but availability and freshness depend on upstream data sources. See <a href="/caller-lookup/">Caller Lookup</a> for the product details.',
				plain: "CNAM lookup returns caller-name information associated with a telephone number when available from supported data sources. Results can help with caller display, call screening, fraud review, CRM enrichment, and routing decisions, but availability and freshness depend on upstream data sources.",
			},
			{
				q: "What is LRN lookup?",
				a: 'LRN lookup helps identify routing information for a number that may have been ported from one carrier to another. It is commonly used for portability-aware call routing, carrier analysis, rating workflows, and telecom troubleshooting. See <a href="/carrier-lookup/">Carrier Lookup</a> for the product details.',
				plain: "LRN lookup helps identify routing information for a number that may have been ported from one carrier to another. It is commonly used for portability-aware call routing, carrier analysis, rating workflows, and telecom troubleshooting.",
			},
		],
	},
	{
		id: "sdn",
		label: "SDN appliance",
		items: [
			{
				q: "What is the VoiceTel SDN appliance?",
				a: 'The <a href="/sdn/">VoiceTel SDN appliance</a> is a small network device used to stabilize SIP connectivity between a customer site and VoiceTel. It is useful when firewalls, NAT, SIP ALG, UDP timers, or RTP behavior make normal SIP trunking unreliable.',
				plain: "The VoiceTel SDN appliance is a small network device used to stabilize SIP connectivity between a customer site and VoiceTel. It is useful when firewalls, NAT, SIP ALG, UDP timers, or RTP behavior make normal SIP trunking unreliable.",
			},
			{
				q: "Does the SDN appliance replace my PBX?",
				a: "No. The SDN appliance does not replace your PBX. It sits on the customer network and provides a controlled path between your PBX or SIP devices and VoiceTel, reducing the common network problems that cause registration failures, one-way audio, and unstable call delivery.",
			},
		],
	},
	{
		id: "api",
		label: "REST API, webhooks & security",
		items: [
			{
				q: "Which API version should I use?",
				a: 'Use API <a href="/docs/api/v2.2/">v2.2</a> for new builds. <a href="/docs/api/v2.1/">v2.1</a> is retained for legacy integrations, migration checks, and comparison against older endpoint behavior.',
				plain: "Use API v2.2 for new builds. v2.1 is retained for legacy integrations, migration checks, and comparison against older endpoint behavior.",
			},
			{
				q: "What is the API playground?",
				a: 'The <a href="/docs/api/v2.2/playground/">API playground</a> lets authorized users run supported requests from the browser, inspect live responses, and compare request shapes against the API reference. Use it for exploration and troubleshooting, not as a substitute for production integration tests.',
				plain: "The API playground lets authorized users run supported requests from the browser, inspect live responses, and compare request shapes against the API reference. Use it for exploration and troubleshooting, not as a substitute for production integration tests.",
			},
			{
				q: "How are API keys stored in the playground?",
				a: 'API keys saved in the playground are stored locally in the browser on that device. Once saved, the key is not displayed in page output or generated examples. The key is used to authorize requests you choose to send. Replace or remove it if you no longer want that browser to use it. See <a href="/docs/api/v2.2/credentials/">credentials</a> for how to retrieve or rotate the key.',
				plain: "API keys saved in the playground are stored locally in the browser on that device. Once saved, the key is not displayed in page output or generated examples. The key is used to authorize requests you choose to send. Replace or remove it if you no longer want that browser to use it. See credentials for how to retrieve or rotate the key.",
			},
		],
	},
	{
		id: "infrastructure",
		label: "Infrastructure, uptime & support",
		items: [
			{
				q: "What information should I include in an incident report?",
				a: 'Include the affected service, account, timestamp with timezone, examples, numbers involved, API request IDs, SIP Call-IDs, message IDs, recent configuration changes, and any traces or logs available. For voice issues, include SIP traces where possible. For messaging issues, include message IDs, campaign IDs, destination numbers, timestamps, and delivery receipts. Reach the team at <a href="/contact/">contact</a>.',
				plain: "Include the affected service, account, timestamp with timezone, examples, numbers involved, API request IDs, SIP Call-IDs, message IDs, recent configuration changes, and any traces or logs available. For voice issues, include SIP traces where possible. For messaging issues, include message IDs, campaign IDs, destination numbers, timestamps, and delivery receipts. Reach the team at contact.",
			},
		],
	},
	{
		id: "troubleshooting",
		label: "Troubleshooting",
		items: [
			{
				q: "My SIP trunk will not register. What should I check?",
				a: 'Check the SIP username, password, domain or realm, registration server, source IP, firewall policy, NAT behavior, TLS settings if used, and registration interval. Also confirm that the account and trunk are active and that your PBX is not being blocked by a local firewall, SIP ALG, or failed authentication lockout. The <a href="/support/voice/firewall/">router and firewall guides</a> cover SIP ALG and NAT-traversal fixes; the <a href="/support/voice/pbx/">PBX guides</a> cover trunk-side configuration.',
				plain: "Check the SIP username, password, domain or realm, registration server, source IP, firewall policy, NAT behavior, TLS settings if used, and registration interval. Also confirm that the account and trunk are active and that your PBX is not being blocked by a local firewall, SIP ALG, or failed authentication lockout. The router and firewall guides cover SIP ALG and NAT-traversal fixes; the PBX guides cover trunk-side configuration.",
			},
			{
				q: "My webhook is timing out. What should I check?",
				a: "Confirm that your webhook endpoint is publicly reachable over HTTPS, presents a valid certificate, responds within the expected timeout, and returns a successful HTTP status. Check your application logs for slow database calls, blocked outbound requests, DNS issues, TLS errors, or deployment changes that occurred near the failure time.",
			},
		],
	},
	{
		id: "resellers",
		label: "Resellers & integrators",
		items: [
			{
				q: "Who owns compliance for downstream customers?",
				a: 'Resellers and integrators are responsible for knowing and verifying their downstream customers, collecting accurate compliance information, and ensuring that customer traffic follows VoiceTel policies, carrier rules, and applicable law. VoiceTel may request additional documentation or restrict traffic if downstream use creates compliance, fraud, or network risk. The <a href="/support/voice/compliance/">voice compliance</a> and <a href="/support/messaging/compliance/">messaging compliance</a> guides explain the operational baseline; the binding policy lives in <a href="/legal/">Legal</a>.',
				plain: "Resellers and integrators are responsible for knowing and verifying their downstream customers, collecting accurate compliance information, and ensuring that customer traffic follows VoiceTel policies, carrier rules, and applicable law. VoiceTel may request additional documentation or restrict traffic if downstream use creates compliance, fraud, or network risk. The voice compliance and messaging compliance guides explain the operational baseline; the binding policy lives in Legal.",
			},
			{
				q: "How does 10DLC work for resellers?",
				a: 'Each real sender generally needs accurate brand and campaign information. A reseller should not use one generic brand or campaign as a proxy for unrelated downstream businesses. Collect each customer\'s legal business information, website, opt-in flow, message samples, privacy policy, terms, and use case before submitting <a href="/support/messaging/10dlc/">10DLC registration</a>. See the <a href="/integrators/">integrators landing page</a> for the multi-tenant workflow.',
				plain: "Each real sender generally needs accurate brand and campaign information. A reseller should not use one generic brand or campaign as a proxy for unrelated downstream businesses. Collect each customer's legal business information, website, opt-in flow, message samples, privacy policy, terms, and use case before submitting 10DLC registration. See the integrators landing page for the multi-tenant workflow.",
			},
		],
	},
	{
		id: "legal",
		label: "Legal, compliance & acceptable use",
		items: [
			{
				q: "Who is responsible for consent?",
				a: 'The customer or sender is responsible for collecting, storing, and honoring valid consent for calls and messages. VoiceTel can provide platform tools and compliance guidance, but it does not replace the customer\'s obligation to follow applicable laws, carrier rules, registry requirements, and industry policies. The binding policy lives in <a href="/legal/">Legal</a>; operational guides are at <a href="/support/voice/compliance/">voice compliance</a> and <a href="/support/messaging/compliance/">messaging compliance</a>.',
				plain: "The customer or sender is responsible for collecting, storing, and honoring valid consent for calls and messages. VoiceTel can provide platform tools and compliance guidance, but it does not replace the customer's obligation to follow applicable laws, carrier rules, registry requirements, and industry policies. The binding policy lives in Legal; operational guides are at voice compliance and messaging compliance.",
			},
		],
	},
];

export default {
	categories,
	flat: categories.flatMap((cat) => cat.items),
};
