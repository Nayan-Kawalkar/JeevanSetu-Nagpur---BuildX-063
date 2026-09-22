/**
 * हिंदी (Hindi) — written the way hospital staff and families in Nagpur actually speak, not as a
 * literal rendering of the English.
 *
 * Clinical resource names keep the English term in brackets — "आईसीयू बेड (ICU bed)" — because a
 * coordinator acts on them under time pressure and must never have to guess which bed is meant.
 *
 * Typed as `Partial`, so a key that is genuinely not translated yet is allowed and falls back to
 * English, while a misspelt key is a compile error.
 */

import type { TranslationKey } from "./en";

export const hi: Partial<Record<TranslationKey, string>> = {
  // ---------- App-wide ----------
  "app.name": "जीवनसेतु ३६०",
  "app.tagline": "सिर्फ़ नज़दीकी नहीं, सही अस्पताल",
  "app.disclaimer":
    "यह साधन एम्बुलेंस दल, अस्पतालों और रक्त बैंकों के बीच समन्वय करता है। यह न रोग की पहचान करता है और न इलाज बताता है।",
  "app.demoBanner":
    "डेमो डेटा · सभी अस्पताल, मरीज़, एम्बुलेंस और रक्त भंडार काल्पनिक हैं। यह केवल समन्वय के लिए है — निदान या इलाज का साधन नहीं।",
  "app.demoDataShort": "डेमो डेटा",

  // ---------- Navigation and roles ----------
  "nav.language": "भाषा",
  "nav.home": "मुख्य पृष्ठ",
  "nav.cases": "मामले",
  "role.paramedic": "एम्बुलेंस स्वास्थ्यकर्मी",
  "role.hospitalCoordinator": "अस्पताल समन्वयक",
  "role.controlRoom": "नियंत्रण कक्ष",
  "role.bloodBank": "रक्त बैंक",
  "role.family": "परिजन",

  // ---------- Common actions ----------
  "action.save": "सहेजें",
  "action.cancel": "रद्द करें",
  "action.retry": "फिर से कोशिश करें",
  "action.confirm": "पुष्टि करें",
  "action.close": "बंद करें",
  "action.back": "वापस",
  "action.loading": "जानकारी आ रही है…",
  "action.search": "खोजें",
  "action.copy": "कॉपी करें",
  "action.refresh": "नई जानकारी लें",

  // ---------- Case status ----------
  "status.CREATED": "दर्ज किया गया",
  "status.REQUIREMENTS_EXTRACTED": "ज़रूरतें तय हुईं",
  "status.MATCHING": "अस्पताल चुना जा रहा है",
  "status.HOSPITAL_REQUESTED": "अस्पताल के उत्तर की प्रतीक्षा",
  "status.ACCEPTED": "अस्पताल ने स्वीकार किया",
  "status.AMBULANCE_EN_ROUTE": "एम्बुलेंस रास्ते में",
  "status.ARRIVED": "पहुँच गई",
  "status.HANDOVER_COMPLETED": "मरीज़ सौंपा गया",
  "status.CLOSED": "बंद",
  "status.CANCELLED": "रद्द",

  // ---------- Severity ----------
  "severity.CRITICAL": "अतिगंभीर",
  "severity.HIGH": "गंभीर",
  "severity.MEDIUM": "मध्यम",
  "severity.LOW": "हल्का",

  // ---------- Incident type ----------
  "incident.ROAD_ACCIDENT": "सड़क दुर्घटना",
  "incident.CARDIAC": "हृदय संबंधी",
  "incident.BURN": "जलना",
  "incident.FALL": "गिरना",
  "incident.ASSAULT": "मारपीट",
  "incident.OTHER": "अन्य",

  // ---------- Resources (bilingual on purpose: the English term is what staff act on) ----------
  "resource.ICU": "आईसीयू बेड (ICU bed)",
  "resource.EMERGENCY_BED": "आपातकालीन बेड (Emergency bed)",
  "resource.NEUROSURGEON": "मस्तिष्क शल्यचिकित्सक (Neurosurgeon)",
  "resource.ORTHOPEDIC_SURGEON": "हड्डी रोग शल्यचिकित्सक (Orthopaedic surgeon)",
  "resource.TRAUMA_TEAM": "आघात उपचार दल (Trauma team)",
  "resource.CT_SCAN": "सीटी स्कैन (CT scan)",
  "resource.VENTILATOR": "कृत्रिम श्वास यंत्र (Ventilator)",
  "resource.BLOOD_BANK": "रक्त (मिलता हुआ रक्त समूह)",
  "resource.OPERATING_ROOM": "शल्यकक्ष (Operating room)",

  // ---------- Blood groups ----------
  // Deliberately identical to English, for the same reason as mr.ts: A+ and O− are international
  // symbols and rewriting them in Devanagari would create a chance of the wrong group being given.
  "bloodGroup.A_POS": "A+",
  "bloodGroup.A_NEG": "A-",
  "bloodGroup.B_POS": "B+",
  "bloodGroup.B_NEG": "B-",
  "bloodGroup.AB_POS": "AB+",
  "bloodGroup.AB_NEG": "AB-",
  "bloodGroup.O_POS": "O+",
  "bloodGroup.O_NEG": "O-",

  // ---------- Blood components ----------
  "bloodComponent.WHOLE_BLOOD": "संपूर्ण रक्त (Whole blood)",
  "bloodComponent.PACKED_RED_CELLS": "लाल रक्त कोशिकाएँ (Packed red cells)",
  "bloodComponent.PLASMA": "प्लाज़्मा (Plasma)",
  "bloodComponent.PLATELETS": "प्लेटलेट्स (Platelets)",

  // ---------- Hospital request status ----------
  "requestStatus.PENDING": "प्रतीक्षा में",
  "requestStatus.ACCEPTED": "स्वीकृत",
  "requestStatus.REJECTED": "अस्वीकृत",
  "requestStatus.EXPIRED": "समय समाप्त",

  // ---------- Blood request status ----------
  "bloodRequestStatus.PENDING": "प्रतीक्षा में",
  "bloodRequestStatus.RESERVED": "आरक्षित",
  "bloodRequestStatus.REJECTED": "अस्वीकृत",
  "bloodRequestStatus.FULFILLED": "पहुँचाया गया",
  "bloodRequestStatus.RELEASED": "मुक्त किया",
  "bloodRequestStatus.EXPIRED": "समय समाप्त",

  // ---------- Ambulance status ----------
  "ambulanceStatus.AVAILABLE": "उपलब्ध",
  "ambulanceStatus.ASSIGNED": "तैनात",
  "ambulanceStatus.EN_ROUTE": "रास्ते में",
  "ambulanceStatus.AT_HOSPITAL": "अस्पताल में",

  // ---------- Paramedic ----------
  "paramedic.newCase": "नया आपातकालीन मामला",
  "paramedic.whatDoYouSee": "आपको क्या दिख रहा है?",
  "paramedic.severity": "गंभीरता",
  "paramedic.location": "स्थान",
  "paramedic.findHospitals": "अस्पताल खोजें",
  "paramedic.sendRequest": "अनुरोध भेजें",
  "paramedic.requirements": "आवश्यक सुविधाएँ",
  "paramedic.bloodGroup": "रक्त समूह",
  "paramedic.unitsNeeded": "कितनी यूनिट चाहिए",

  // ---------- Blood ----------
  "blood.unitsOfGroup": "{group} रक्त समूह की {count} यूनिट",
  "blood.units": "{count} यूनिट",
  "blood.available": "उपलब्ध",
  "blood.reserved": "आरक्षित",

  // ---------- Family page ----------
  "family.pageTitle": "आपातकालीन स्थिति",
  "family.yourRelative": "आपके परिजन",
  "family.status": "स्थिति",
  "family.hospital": "अस्पताल",
  "family.arrivingIn": "पहुँचने में",
  "family.arrivingInMinutes": "{minutes} मिनट में पहुँचेगी",
  "family.lastUpdate": "आख़िरी जानकारी",
  "family.bloodArranged": "रक्त की व्यवस्था हो गई",
  "family.bloodBeingArranged": "रक्त की व्यवस्था की जा रही है",
  "family.bloodNotRequested": "इस मामले के लिए रक्त की माँग नहीं की गई है",
  "family.noHospitalYet": "अभी तक अस्पताल तय नहीं हुआ है",
  "family.readOnly": "केवल पढ़ने के लिए",
  "family.note":
    "इस पृष्ठ पर केवल वही जानकारी है जिसकी पुष्टि दल ने की है। एम्बुलेंस के आगे बढ़ने पर समय बदल सकता है।",
  "family.linkExpired": "इस लिंक की अवधि समाप्त हो चुकी है। कृपया अस्पताल के कर्मचारियों से नया लिंक माँगें।",

  // ---------- Reservation status ----------
  "reservationStatus.ACTIVE": "सक्रिय",
  "reservationStatus.RELEASED": "मुक्त किया",
  "reservationStatus.EXPIRED": "समय समाप्त",
  "reservationStatus.CONSUMED": "उपयोग हुआ",

  // ---------- Hospital suitability ----------
  "suitability.SUITABLE": "उपयुक्त",
  "suitability.PARTIAL": "आंशिक रूप से उपयुक्त",
  "suitability.UNSUITABLE": "इस मरीज़ का इलाज संभव नहीं",

  // ---------- Shell ----------
  "shell.subtitle": "नागपुर आपातकालीन समन्वय",
  "shell.footer": "Build-X हैकाथॉन प्रोटोटाइप · स्वास्थ्य एवं आपातकालीन सेवा ट्रैक · काल्पनिक डेमो डेटा",
  "shell.noRoleSelected": "कोई भूमिका नहीं चुनी",
  "shell.currentRole": "वर्तमान भूमिका: {role}",
  "shell.offline": "संपर्क टूटा",
  "shell.noActiveEmergencies": "अभी कोई आपातकाल नहीं",
  "shell.activeCritical": "{active} सक्रिय · {critical} गंभीर",

  // ---------- Landing page ----------
  "home.track": "स्वास्थ्य एवं आपातकालीन सेवा · नागपुर",
  "home.lede":
    "जीवनसेतु ३६० आईसीयू बेड (ICU bed), उपलब्ध विशेषज्ञ, रक्त भंडार, यात्रा समय और अस्पताल की स्वीकृति एक ही साझा बोर्ड पर लाता है, ताकि एम्बुलेंस ऐसे अस्पताल न पहुँचे जहाँ इलाज संभव ही नहीं है।",
  "home.ctaDemo": "रोहन का डेमो शुरू करें",
  "home.ctaControlRoom": "नियंत्रण कक्ष खोलें",
  "home.storyTitle": "आज की स्थिति — समन्वय के बिना",
  "home.story1": "वर्धा रोड पर ट्रक ने मोटरसाइकिल सवार को टक्कर मारी",
  "home.story2": "एम्बुलेंस नज़दीकी निजी अस्पताल पहुँची: न आईसीयू, न न्यूरोसर्जन",
  "home.story3": "सरकारी अस्पताल: O- रक्त कम",
  "home.story4": "अंततः उसी अस्पताल में भर्ती जहाँ शुरू से बेड खाली था",
  "home.storyCost": "१ घंटा ५० मिनट बर्बाद। बेड की स्थिति, विशेषज्ञ और रक्त भंडार सिर्फ़ फ़ोन कॉल और रजिस्टर में थे।",
  "home.rolesTitle": "डेमो भूमिका चुनें",
  "home.noLogin": "डेमो प्रवेश · लॉगिन नहीं",
  "home.signInPrompt":
    "ये चार कार्ड सीधे डैशबोर्ड खोलते हैं। भूमिका के अनुसार अधिकार कैसे सीमित होते हैं — एक समन्वयक दूसरे अस्पताल के बेड नहीं बदल सकता — यह देखने के लिए पहले भूमिका चुनें।",
  "home.roleDesc.PARAMEDIC": "आपातकालीन मामला दर्ज करें और कारण सहित अस्पताल की सिफ़ारिश पाएँ।",
  "home.roleDesc.HOSPITAL_COORDINATOR":
    "आईसीयू, विशेषज्ञ और उपकरणों की स्थिति अद्यतन रखें। आने वाले मामले स्वीकार या अस्वीकार करें।",
  "home.roleDesc.CONTROL_ROOM_OPERATOR":
    "सभी सक्रिय घटनाएँ, अस्पताल क्षमता, पुरानी जानकारी और रक्त चेतावनियाँ एक ही मानचित्र पर देखें।",
  "home.roleDesc.BLOOD_BANK_OPERATOR": "रक्त समूह के अनुसार भंडार अद्यतन करें और आपातकालीन आरक्षण देखें।",

  // ---------- Choosing a demo role ----------
  "demoLogin.link": "भूमिका चुनें",
  "demoLogin.linkTitle": "डेमो भूमिका चुनें, या वर्तमान भूमिका छोड़ें",

  // ---------- Relative ages ----------
  "duration.justNow": "अभी-अभी",
  "duration.minutesAgo": "{count} मिनट पहले",
  "duration.hoursAgo": "{count} घंटे पहले",

  // ---------- Data freshness ----------
  "freshness.unconfirmed": "⚠ अपुष्ट",
  "freshness.at": "आख़िरी पुष्टि {time} बजे",
  "freshness.ago": "आख़िरी पुष्टि {age}",
  "freshness.by": "— {name} द्वारा",

  // ---------- Crew case list ----------
  "caseList.activeNow": "अभी सक्रिय",
  "caseList.openCount": "{count} सक्रिय",
  "caseList.earlierToday": "आज के पिछले मामले",
  "caseList.finishedCount": "{count} पूर्ण",
  "caseList.nothingOpen": "अभी कुछ भी सक्रिय नहीं है।",
  "caseList.noCasesTitle": "अभी तक कोई मामला नहीं",
  "caseList.noCasesBody":
    "इस दल के लिए कुछ भी सक्रिय नहीं है। पहला मामला दर्ज करें — नियंत्रण कक्ष और अस्पतालों को वह तुरंत दिखेगा।",
  "caseList.createFirst": "पहला मामला दर्ज करें",
  "caseList.loadingCases": "मामले आ रहे हैं",
  "caseList.loadFailed": "मामलों की सूची नहीं मिल सकी।",
  "caseList.updatesPaused": "लाइव अपडेट रुके हैं — पिछली मिली सूची दिखाई जा रही है।",
  "caseList.patientId": "मरीज़ क्रमांक:",
  "caseList.hospital": "अस्पताल:",
  "caseList.noHospitalYet": "अभी तय नहीं",
  "caseList.openedAt": "{time} बजे दर्ज",
  "caseList.openUnderMinute": "एक मिनट से कम समय से",
  "caseList.openMinutes": "{minutes} मिनट से",
  "caseList.openHours": "{duration} से",

  // ---------- Errors ----------
  "error.generic": "कुछ गड़बड़ हो गई",
  "error.network": "सर्वर से संपर्क नहीं हो सका",
  "error.tryAgain": "फिर से कोशिश करें",
  "error.notFound": "नहीं मिला",
};
