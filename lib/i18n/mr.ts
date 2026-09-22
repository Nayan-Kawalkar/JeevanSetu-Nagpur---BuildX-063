/**
 * मराठी (Marathi) — Nagpur's own language, so this is the file a local judge or a family member
 * will actually read. Written the way hospital staff and families speak, not word-for-word from
 * the English.
 *
 * Clinical resource names keep the English term in brackets — "आयसीयू बेड (ICU bed)" — because a
 * coordinator acts on them under time pressure and must never have to guess which bed is meant.
 *
 * Typed as `Partial`, so a key that is genuinely not translated yet is allowed and falls back to
 * English, while a misspelt key is a compile error.
 */

import type { TranslationKey } from "./en";

export const mr: Partial<Record<TranslationKey, string>> = {
  // ---------- App-wide ----------
  "app.name": "जीवनसेतू ३६०",
  "app.tagline": "फक्त जवळचे नव्हे, योग्य रुग्णालय",
  "app.disclaimer":
    "हे साधन रुग्णवाहिका पथक, रुग्णालये आणि रक्तपेढ्या यांच्यात समन्वय साधते. ते निदान करत नाही आणि उपचार सुचवत नाही.",
  "app.demoBanner":
    "प्रात्यक्षिक माहिती · सर्व रुग्णालये, रुग्ण, रुग्णवाहिका आणि रक्तसाठा काल्पनिक आहेत. हे केवळ समन्वयासाठी आहे — निदान किंवा उपचाराचे साधन नाही.",
  "app.demoDataShort": "प्रात्यक्षिक माहिती",

  // ---------- Navigation and roles ----------
  "nav.language": "भाषा",
  "nav.home": "मुख्यपृष्ठ",
  "nav.cases": "रुग्ण नोंदी",
  "role.paramedic": "रुग्णवाहिका आरोग्य कर्मचारी",
  "role.hospitalCoordinator": "रुग्णालय समन्वयक",
  "role.controlRoom": "नियंत्रण कक्ष",
  "role.bloodBank": "रक्तपेढी",
  "role.family": "नातेवाईक",

  // ---------- Common actions ----------
  "action.save": "जतन करा",
  "action.cancel": "रद्द करा",
  "action.retry": "पुन्हा प्रयत्न करा",
  "action.confirm": "निश्चित करा",
  "action.close": "बंद करा",
  "action.back": "मागे",
  "action.loading": "माहिती येत आहे…",
  "action.search": "शोधा",
  "action.copy": "प्रत करा",
  "action.refresh": "नवीन माहिती घ्या",

  // ---------- Case status ----------
  "status.CREATED": "नोंद झाली",
  "status.REQUIREMENTS_EXTRACTED": "गरजा निश्चित झाल्या",
  "status.MATCHING": "रुग्णालय निवडत आहे",
  "status.HOSPITAL_REQUESTED": "रुग्णालयाच्या उत्तराची प्रतीक्षा",
  "status.ACCEPTED": "रुग्णालयाने स्वीकारले",
  "status.AMBULANCE_EN_ROUTE": "रुग्णवाहिका मार्गावर",
  "status.ARRIVED": "पोहोचली",
  "status.HANDOVER_COMPLETED": "रुग्ण सुपूर्द केला",
  "status.CLOSED": "बंद",
  "status.CANCELLED": "रद्द",

  // ---------- Severity ----------
  "severity.CRITICAL": "अतिगंभीर",
  "severity.HIGH": "गंभीर",
  "severity.MEDIUM": "मध्यम",
  "severity.LOW": "सौम्य",

  // ---------- Incident type ----------
  "incident.ROAD_ACCIDENT": "रस्ता अपघात",
  "incident.CARDIAC": "हृदयविकार",
  "incident.BURN": "भाजणे",
  "incident.FALL": "पडणे",
  "incident.ASSAULT": "मारहाण",
  "incident.OTHER": "इतर",

  // ---------- Resources (bilingual on purpose: the English term is what staff act on) ----------
  "resource.ICU": "आयसीयू बेड (ICU bed)",
  "resource.EMERGENCY_BED": "आपत्कालीन बेड (Emergency bed)",
  "resource.NEUROSURGEON": "मेंदू शस्त्रक्रिया तज्ज्ञ (Neurosurgeon)",
  "resource.ORTHOPEDIC_SURGEON": "अस्थिरोग शस्त्रक्रिया तज्ज्ञ (Orthopaedic surgeon)",
  "resource.TRAUMA_TEAM": "अपघात उपचार पथक (Trauma team)",
  "resource.CT_SCAN": "सीटी स्कॅन (CT scan)",
  "resource.VENTILATOR": "कृत्रिम श्वसन यंत्र (Ventilator)",
  "resource.BLOOD_BANK": "रक्त (जुळणारा रक्तगट)",
  "resource.OPERATING_ROOM": "शस्त्रक्रिया गृह (Operating room)",

  // ---------- Blood groups ----------
  // Deliberately identical to English. A+ and O− are international symbols; rewriting them in
  // Devanagari would create a chance of handing over the wrong group. Listed rather than omitted
  // so it is clear this is a decision, not an oversight.
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
  "bloodComponent.PACKED_RED_CELLS": "लाल रक्तपेशी (Packed red cells)",
  "bloodComponent.PLASMA": "प्लाझ्मा (Plasma)",
  "bloodComponent.PLATELETS": "प्लेटलेट्स (Platelets)",

  // ---------- Hospital request status ----------
  "requestStatus.PENDING": "प्रतीक्षेत",
  "requestStatus.ACCEPTED": "स्वीकारले",
  "requestStatus.REJECTED": "नाकारले",
  "requestStatus.EXPIRED": "मुदत संपली",

  // ---------- Blood request status ----------
  "bloodRequestStatus.PENDING": "प्रतीक्षेत",
  "bloodRequestStatus.RESERVED": "राखून ठेवले",
  "bloodRequestStatus.REJECTED": "नाकारले",
  "bloodRequestStatus.FULFILLED": "पोहोचवले",
  "bloodRequestStatus.RELEASED": "मोकळे केले",
  "bloodRequestStatus.EXPIRED": "मुदत संपली",

  // ---------- Ambulance status ----------
  "ambulanceStatus.AVAILABLE": "उपलब्ध",
  "ambulanceStatus.ASSIGNED": "नेमून दिली",
  "ambulanceStatus.EN_ROUTE": "मार्गावर",
  "ambulanceStatus.AT_HOSPITAL": "रुग्णालयात",

  // ---------- Paramedic ----------
  "paramedic.newCase": "नवीन आपत्कालीन नोंद",
  "paramedic.whatDoYouSee": "तुम्हाला काय दिसत आहे?",
  "paramedic.severity": "तीव्रता",
  "paramedic.location": "ठिकाण",
  "paramedic.findHospitals": "रुग्णालये शोधा",
  "paramedic.sendRequest": "विनंती पाठवा",
  "paramedic.requirements": "आवश्यक सुविधा",
  "paramedic.bloodGroup": "रक्तगट",
  "paramedic.unitsNeeded": "लागणारे युनिट",

  // ---------- Blood ----------
  "blood.unitsOfGroup": "{group} रक्तगटाचे {count} युनिट",
  "blood.units": "{count} युनिट",
  "blood.available": "उपलब्ध",
  "blood.reserved": "राखीव",

  // ---------- Family page ----------
  "family.pageTitle": "आपत्कालीन स्थिती",
  "family.yourRelative": "तुमचे नातेवाईक",
  "family.status": "स्थिती",
  "family.hospital": "रुग्णालय",
  "family.arrivingIn": "पोहोचण्यास",
  "family.arrivingInMinutes": "{minutes} मिनिटांत पोहोचेल",
  "family.lastUpdate": "शेवटची माहिती",
  "family.bloodArranged": "रक्ताची व्यवस्था झाली",
  "family.bloodBeingArranged": "रक्ताची व्यवस्था सुरू आहे",
  "family.bloodNotRequested": "या नोंदीसाठी रक्ताची मागणी केलेली नाही",
  "family.noHospitalYet": "अद्याप रुग्णालय निश्चित झालेले नाही",
  "family.readOnly": "फक्त वाचनासाठी",
  "family.note":
    "या पानावर फक्त पथकाने निश्चित केलेली माहिती दिसते. रुग्णवाहिका पुढे जाईल तसे वेळा बदलू शकतात.",
  "family.linkExpired": "या दुव्याची मुदत संपली आहे. कृपया रुग्णालयातील कर्मचाऱ्यांकडून नवीन दुवा मागा.",

  // ---------- Reservation status ----------
  "reservationStatus.ACTIVE": "सुरू",
  "reservationStatus.RELEASED": "मोकळे केले",
  "reservationStatus.EXPIRED": "मुदत संपली",
  "reservationStatus.CONSUMED": "वापरले",

  // ---------- Hospital suitability ----------
  "suitability.SUITABLE": "योग्य",
  "suitability.PARTIAL": "अंशतः योग्य",
  "suitability.UNSUITABLE": "या रुग्णावर उपचार शक्य नाहीत",

  // ---------- Shell ----------
  "shell.subtitle": "नागपूर आपत्कालीन समन्वय",
  "shell.footer": "Build-X हॅकेथॉन प्रात्यक्षिक · आरोग्य आणि आपत्कालीन सेवा गट · काल्पनिक प्रात्यक्षिक माहिती",
  "shell.noRoleSelected": "भूमिका निवडलेली नाही",
  "shell.currentRole": "सध्याची भूमिका: {role}",
  "shell.offline": "संपर्क तुटला",
  "shell.noActiveEmergencies": "सध्या एकही आपत्काल नाही",
  "shell.activeCritical": "{active} सुरू · {critical} गंभीर",

  // ---------- Landing page ----------
  "home.track": "आरोग्य आणि आपत्कालीन सेवा · नागपूर",
  "home.lede":
    "जीवनसेतू ३६० आयसीयू बेड (ICU bed), उपलब्ध तज्ज्ञ डॉक्टर, रक्तसाठा, प्रवासाचा वेळ आणि रुग्णालयाची संमती हे सर्व एकाच पटलावर आणते, त्यामुळे रुग्णवाहिका अशा रुग्णालयात पोहोचत नाही जिथे उपचार शक्य नाहीत.",
  "home.ctaDemo": "रोहनचे प्रात्यक्षिक सुरू करा",
  "home.ctaControlRoom": "नियंत्रण कक्ष उघडा",
  "home.storyTitle": "आजची स्थिती — समन्वयाशिवाय",
  "home.story1": "वर्धा रोडवर ट्रकची दुचाकीस्वाराला धडक",
  "home.story2": "रुग्णवाहिका जवळच्या खासगी रुग्णालयात: आयसीयू नाही, मेंदू शस्त्रक्रिया तज्ज्ञ नाही",
  "home.story3": "शासकीय रुग्णालय: O- रक्तसाठा कमी",
  "home.story4": "शेवटी ज्या रुग्णालयात सुरुवातीपासून बेड होता तिथेच दाखल",
  "home.storyCost": "१ तास ५० मिनिटे वाया. बेडची स्थिती, तज्ज्ञ आणि रक्तसाठा फक्त फोन कॉल आणि रजिस्टरमध्ये होता.",
  "home.rolesTitle": "प्रात्यक्षिकासाठी भूमिका निवडा",
  "home.noLogin": "प्रात्यक्षिक प्रवेश · लॉगिन नाही",
  "home.signInPrompt":
    "ही चार कार्डे थेट पटल उघडतात. भूमिकेनुसार अधिकार कसे मर्यादित होतात — एक समन्वयक दुसऱ्या रुग्णालयाचे बेड बदलू शकत नाही — हे पाहण्यासाठी आधी भूमिका निवडा.",
  "home.roleDesc.PARAMEDIC": "आपत्कालीन नोंद करा आणि कारणांसह रुग्णालयाची शिफारस मिळवा.",
  "home.roleDesc.HOSPITAL_COORDINATOR":
    "आयसीयू, तज्ज्ञ आणि उपकरणांची स्थिती अद्ययावत ठेवा. येणाऱ्या नोंदी स्वीकारा किंवा नाकारा.",
  "home.roleDesc.CONTROL_ROOM_OPERATOR":
    "सर्व सुरू असलेल्या घटना, रुग्णालयांची क्षमता, जुनी माहिती आणि रक्ताचे इशारे एकाच नकाशावर पाहा.",
  "home.roleDesc.BLOOD_BANK_OPERATOR": "रक्तगटानुसार साठा अद्ययावत करा आणि आपत्कालीन आरक्षणे पाहा.",

  // ---------- Choosing a demo role ----------
  "demoLogin.link": "भूमिका निवडा",
  "demoLogin.linkTitle": "प्रात्यक्षिकासाठी भूमिका निवडा, किंवा सध्याची भूमिका सोडा",

  // ---------- Relative ages ----------
  "duration.justNow": "आत्ताच",
  "duration.minutesAgo": "{count} मिनिटांपूर्वी",
  "duration.hoursAgo": "{count} तासांपूर्वी",

  // ---------- Data freshness ----------
  "freshness.unconfirmed": "⚠ अपुष्ट",
  "freshness.at": "शेवटची खात्री {time} वाजता",
  "freshness.ago": "शेवटची खात्री {age}",
  "freshness.by": "— {name} यांनी",

  // ---------- Crew case list ----------
  "caseList.activeNow": "सध्या सुरू",
  "caseList.openCount": "{count} सुरू",
  "caseList.earlierToday": "आजच्या आधीच्या नोंदी",
  "caseList.finishedCount": "{count} पूर्ण",
  "caseList.nothingOpen": "सध्या काहीही सुरू नाही.",
  "caseList.noCasesTitle": "अद्याप एकही नोंद नाही",
  "caseList.noCasesBody":
    "या पथकासाठी काहीही सुरू नाही. पहिली नोंद करा — नियंत्रण कक्ष आणि रुग्णालयांना ती लगेच दिसेल.",
  "caseList.createFirst": "पहिली नोंद करा",
  "caseList.loadingCases": "नोंदी येत आहेत",
  "caseList.loadFailed": "नोंदींची यादी मिळू शकली नाही.",
  "caseList.updatesPaused": "थेट माहिती थांबली आहे — शेवटी मिळालेली यादी दाखवत आहोत.",
  "caseList.patientId": "रुग्ण क्रमांक:",
  "caseList.hospital": "रुग्णालय:",
  "caseList.noHospitalYet": "अद्याप निवडलेले नाही",
  "caseList.openedAt": "{time} वाजता नोंद",
  "caseList.openUnderMinute": "एका मिनिटापेक्षा कमी वेळ सुरू",
  "caseList.openMinutes": "{minutes} मिनिटे सुरू",
  "caseList.openHours": "{duration} सुरू",

  // ---------- Errors ----------
  "error.generic": "काहीतरी चूक झाली",
  "error.network": "सर्व्हरशी संपर्क होऊ शकला नाही",
  "error.tryAgain": "पुन्हा प्रयत्न करा",
  "error.notFound": "सापडले नाही",
};
