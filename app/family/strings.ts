/**
 * Wording that belongs only to the family page.
 *
 * The shared dictionary in lib/i18n carries the labels every screen needs — statuses, severity,
 * blood, "last update". It is written for staff. A relative reading "Awaiting hospital" at two
 * in the morning needs a sentence, not a board label, so the plain-words status, the milestone
 * lines and the page's own framing live here and are translated here.
 *
 * Marathi and Hindi are complete for this page on purpose: this is the one screen whose reader
 * never chose to use the app and may not read English at all. English is still the fallback for
 * any key a locale misses, because an untranslated word beats a blank line.
 *
 * Nothing here reads the clock, and nothing here is a diagnosis, a treatment or a promise.
 */
import type { Locale, CaseStatus } from "@/lib/types";
import type { FamilyMilestoneType } from "@/lib/services/family";

// ---------- Page framing ----------

const pageEn = {
  service: "Status page from the Nagpur ambulance service.",
  demo: "Demonstration only — every name and detail on this page is fictional.",
  clinical:
    "For any medical question, please call the hospital directly. This page does not give medical advice.",
  reference: "Reference number",
  severityLabel: "Severity recorded by the crew",
  callHospital: "Call the hospital",
  bloodHeading: "Blood",
  milestonesHeading: "What has happened so far",
  noMilestones: "Nothing has been recorded yet.",
  etaUnknown: "Not known yet",
  etaNote: "An estimate based on average traffic. It can change.",
  loading: "Loading…",
  stale: "Could not reach the service just now. This is the last information received.",
  inactiveTitle: "This link is no longer active",
  inactiveBody: "Please contact the ambulance service for an update.",
  autoRefresh: "This page updates by itself every few seconds.",
  minutesAgo: "{minutes} min ago",
  justNow: "just now",
} as const;

export type FamilyStringKey = keyof typeof pageEn;

const pageMr: Partial<Record<FamilyStringKey, string>> = {
  service: "नागपूर रुग्णवाहिका सेवेकडून स्थिती माहिती.",
  demo: "हे केवळ प्रात्यक्षिक आहे — या पानावरील सर्व नावे आणि तपशील काल्पनिक आहेत.",
  clinical: "कोणत्याही वैद्यकीय प्रश्नासाठी थेट रुग्णालयाला फोन करा. हे पान वैद्यकीय सल्ला देत नाही.",
  reference: "संदर्भ क्रमांक",
  severityLabel: "पथकाने नोंदवलेली तीव्रता",
  callHospital: "रुग्णालयाला फोन करा",
  bloodHeading: "रक्त",
  milestonesHeading: "आतापर्यंत काय झाले",
  noMilestones: "अद्याप काहीही नोंदवलेले नाही.",
  etaUnknown: "अद्याप माहीत नाही",
  etaNote: "सरासरी वाहतुकीवर आधारित अंदाज. तो बदलू शकतो.",
  loading: "लोड होत आहे…",
  stale: "सेवेशी आत्ता संपर्क होऊ शकला नाही. ही शेवटची मिळालेली माहिती आहे.",
  inactiveTitle: "हा दुवा आता चालू नाही",
  inactiveBody: "कृपया अद्ययावत माहितीसाठी रुग्णवाहिका सेवेशी संपर्क साधा.",
  autoRefresh: "हे पान दर काही सेकंदांनी आपोआप अद्ययावत होते.",
  minutesAgo: "{minutes} मिनिटांपूर्वी",
  justNow: "आत्ताच",
};

const pageHi: Partial<Record<FamilyStringKey, string>> = {
  service: "नागपुर एम्बुलेंस सेवा की ओर से स्थिति जानकारी।",
  demo: "यह केवल प्रदर्शन है — इस पृष्ठ के सभी नाम और विवरण काल्पनिक हैं।",
  clinical: "किसी भी चिकित्सीय प्रश्न के लिए सीधे अस्पताल को फ़ोन करें। यह पृष्ठ चिकित्सीय सलाह नहीं देता।",
  reference: "संदर्भ संख्या",
  severityLabel: "दल द्वारा दर्ज गंभीरता",
  callHospital: "अस्पताल को फ़ोन करें",
  bloodHeading: "रक्त",
  milestonesHeading: "अब तक क्या हुआ",
  noMilestones: "अभी तक कुछ भी दर्ज नहीं हुआ है।",
  etaUnknown: "अभी पता नहीं",
  etaNote: "औसत यातायात पर आधारित अनुमान। यह बदल सकता है।",
  loading: "लोड हो रहा है…",
  stale: "अभी सेवा से संपर्क नहीं हो सका। यह आख़िरी मिली जानकारी है।",
  inactiveTitle: "यह लिंक अब सक्रिय नहीं है",
  inactiveBody: "कृपया ताज़ा जानकारी के लिए एम्बुलेंस सेवा से संपर्क करें।",
  autoRefresh: "यह पृष्ठ हर कुछ सेकंड में अपने आप अपडेट होता है।",
  minutesAgo: "{minutes} मिनट पहले",
  justNow: "अभी-अभी",
};

const PAGE: Record<Locale, Partial<Record<FamilyStringKey, string>>> = { en: pageEn, mr: pageMr, hi: pageHi };

// ---------- Status, in plain words ----------

const statusEn: Record<CaseStatus, string> = {
  CREATED: "Details are being recorded",
  REQUIREMENTS_EXTRACTED: "Details are being recorded",
  MATCHING: "A hospital is being chosen",
  HOSPITAL_REQUESTED: "Waiting for a hospital to confirm",
  ACCEPTED: "A hospital has confirmed",
  AMBULANCE_EN_ROUTE: "On the way to the hospital",
  ARRIVED: "At the hospital",
  HANDOVER_COMPLETED: "With the hospital team",
  CLOSED: "This record is closed",
  CANCELLED: "This record was cancelled",
};

const statusMr: Record<CaseStatus, string> = {
  CREATED: "माहिती नोंदवली जात आहे",
  REQUIREMENTS_EXTRACTED: "माहिती नोंदवली जात आहे",
  MATCHING: "रुग्णालय निवडले जात आहे",
  HOSPITAL_REQUESTED: "रुग्णालयाच्या होकाराची वाट पाहत आहोत",
  ACCEPTED: "रुग्णालयाने होकार दिला आहे",
  AMBULANCE_EN_ROUTE: "रुग्णवाहिका रुग्णालयाकडे जात आहे",
  ARRIVED: "रुग्णालयात पोहोचले आहे",
  HANDOVER_COMPLETED: "रुग्णालयाच्या पथकाकडे सोपवले आहे",
  CLOSED: "ही नोंद बंद करण्यात आली आहे",
  CANCELLED: "ही नोंद रद्द करण्यात आली",
};

const statusHi: Record<CaseStatus, string> = {
  CREATED: "जानकारी दर्ज की जा रही है",
  REQUIREMENTS_EXTRACTED: "जानकारी दर्ज की जा रही है",
  MATCHING: "अस्पताल चुना जा रहा है",
  HOSPITAL_REQUESTED: "अस्पताल की पुष्टि का इंतज़ार है",
  ACCEPTED: "अस्पताल ने पुष्टि कर दी है",
  AMBULANCE_EN_ROUTE: "एम्बुलेंस अस्पताल की ओर जा रही है",
  ARRIVED: "अस्पताल पहुँच गए हैं",
  HANDOVER_COMPLETED: "अस्पताल की टीम को सौंप दिया गया है",
  CLOSED: "यह रिकॉर्ड बंद कर दिया गया है",
  CANCELLED: "यह रिकॉर्ड रद्द कर दिया गया",
};

const STATUS: Record<Locale, Record<CaseStatus, string>> = { en: statusEn, mr: statusMr, hi: statusHi };

// ---------- Milestones ----------

const milestoneEn: Record<FamilyMilestoneType, string> = {
  CASE_CREATED: "The ambulance service opened this record.",
  HOSPITAL_ACCEPTED: "A hospital confirmed it can receive the patient.",
  BLOOD_RESERVED: "Blood of the needed group has been set aside.",
  BLOOD_FULFILLED: "The blood units have reached the hospital.",
  AMBULANCE_EN_ROUTE: "The ambulance is travelling to the hospital.",
  ARRIVED: "The ambulance reached the hospital.",
  HANDOVER_COMPLETED: "The hospital team has taken over care.",
  CASE_CANCELLED: "The ambulance service cancelled this record.",
};

const milestoneMr: Record<FamilyMilestoneType, string> = {
  CASE_CREATED: "रुग्णवाहिका सेवेने ही नोंद सुरू केली.",
  HOSPITAL_ACCEPTED: "रुग्णालयाने रुग्णाला दाखल करून घेण्याचे मान्य केले.",
  BLOOD_RESERVED: "आवश्यक गटाचे रक्त राखून ठेवले आहे.",
  BLOOD_FULFILLED: "रक्ताच्या पिशव्या रुग्णालयात पोहोचल्या आहेत.",
  AMBULANCE_EN_ROUTE: "रुग्णवाहिका रुग्णालयाकडे निघाली आहे.",
  ARRIVED: "रुग्णवाहिका रुग्णालयात पोहोचली.",
  HANDOVER_COMPLETED: "रुग्णालयाच्या पथकाने पुढील काळजी घेणे सुरू केले आहे.",
  CASE_CANCELLED: "रुग्णवाहिका सेवेने ही नोंद रद्द केली.",
};

const milestoneHi: Record<FamilyMilestoneType, string> = {
  CASE_CREATED: "एम्बुलेंस सेवा ने यह रिकॉर्ड शुरू किया।",
  HOSPITAL_ACCEPTED: "अस्पताल ने मरीज़ को लेने की पुष्टि की।",
  BLOOD_RESERVED: "ज़रूरी ग्रुप का रक्त अलग रख दिया गया है।",
  BLOOD_FULFILLED: "रक्त की इकाइयाँ अस्पताल पहुँच गई हैं।",
  AMBULANCE_EN_ROUTE: "एम्बुलेंस अस्पताल की ओर रवाना हो गई है।",
  ARRIVED: "एम्बुलेंस अस्पताल पहुँच गई।",
  HANDOVER_COMPLETED: "अस्पताल की टीम ने आगे की देखभाल संभाल ली है।",
  CASE_CANCELLED: "एम्बुलेंस सेवा ने यह रिकॉर्ड रद्द कर दिया।",
};

const MILESTONE: Record<Locale, Record<FamilyMilestoneType, string>> = {
  en: milestoneEn,
  mr: milestoneMr,
  hi: milestoneHi,
};

// ---------- Lookups ----------

const PLACEHOLDER = /\{(\w+)\}/g;

function fill(template: string, vars?: Record<string, string | number>): string {
  if (vars === undefined) return template;
  return template.replace(PLACEHOLDER, (match: string, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

export function familyText(
  locale: Locale,
  key: FamilyStringKey,
  vars?: Record<string, string | number>,
): string {
  return fill(PAGE[locale][key] ?? pageEn[key], vars);
}

export function familyStatusText(locale: Locale, status: CaseStatus): string {
  return STATUS[locale][status];
}

export function familyMilestoneText(locale: Locale, type: FamilyMilestoneType): string {
  return MILESTONE[locale][type];
}
