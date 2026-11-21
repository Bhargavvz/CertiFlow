// English + Hindi for the two public pages people open from WhatsApp or a QR code
// (verify, candidate download). Plain dictionaries, no library: two pages don't need one.
import { createContext, useContext, useState, type ReactNode } from 'react';

const en = {
  'lang.toggle': 'हिन्दी',
  'lang.toggleLabel': 'हिन्दी में देखें',
  'brand.programme': 'Pragati Skills Mission',
  'verify.title': 'Verify a certificate',
  'verify.subtitle': 'Check that a skilling certificate is genuine and still valid. No login needed.',
  'verify.inputLabel': 'Certificate number',
  'verify.placeholder': 'PSM-2026-XXXXXXXXXXX',
  'verify.formatHint': 'Format: PSM-year-11 letters/digits. Printed under the QR code.',
  'verify.formatInvalid': 'That doesn’t look like a certificate number. It should look like PSM-2026-7KQ2M9XHRT4.',
  'verify.button': 'Verify',
  'verify.scan': 'Scan QR code',
  'verify.scanStop': 'Stop camera',
  'verify.scanHint': 'Point your camera at the QR code on the certificate.',
  'verify.scanDenied': 'Camera access was blocked. Type the number instead.',
  'verify.scanUnavailable': 'No camera available on this device.',
  'verify.scanWrongCode': 'That QR code isn’t a CertiFlow verification code.',
  'verify.checking': 'Checking…',
  'verify.valid.title': 'Valid certificate',
  'verify.valid.body': 'This certificate was issued by the Pragati Skills Mission and has not been revoked.',
  'verify.revoked.title': 'This certificate is no longer valid',
  'verify.revoked.body': 'It was revoked by the State skills office. Do not accept it as proof of training.',
  'verify.notFound.title': 'No certificate found',
  'verify.notFound.body': 'We couldn’t find a certificate with this number.',
  'verify.notFound.tip1': 'Check each character carefully. The letters I, L, O and U are never used.',
  'verify.notFound.tip2': 'If you scanned a QR code and still see this, the certificate may be forged.',
  'verify.rateLimited': 'Too many checks from your network. Please try again in {s} seconds.',
  'verify.error': 'The verification service is unavailable right now. Please try again shortly.',
  'verify.holder': 'Holder',
  'verify.course': 'Course',
  'verify.centre': 'Training centre',
  'verify.issued': 'Issued on',
  'verify.revokedOn': 'Revoked on',
  'verify.number': 'Certificate number',
  'verify.pdf.title': 'Check a PDF file',
  'verify.pdf.body': 'Choose the certificate PDF you received. It is checked on this device; the file is never uploaded.',
  'verify.pdf.choose': 'Choose PDF',
  'verify.pdf.match': 'This file matches the original certificate exactly.',
  'verify.pdf.changed': 'This file has been changed. It is not the original issued certificate.',
  'verify.pdf.checking': 'Checking file…',
  'verify.privacy.title': 'What this page shows',
  'verify.privacy.shows': 'Shown: initials of the holder, course, training centre, issue date and status.',
  'verify.privacy.hides': 'Never shown: phone numbers, enrolment IDs, dates of birth, scores or the reason for a revocation.',
  'candidate.hello': 'Congratulations, {name}!',
  'candidate.ready': 'Your certificate is ready.',
  'candidate.download': 'Download certificate (PDF)',
  'candidate.share': 'Share verification link',
  'candidate.shared': 'Link copied',
  'candidate.verifyNote': 'Employers can scan this code or open the link to check your certificate is genuine.',
  'candidate.revoked.title': 'This certificate is no longer valid',
  'candidate.revoked.body': 'It was revoked by the State skills office. Contact your training centre if you think this is a mistake.',
  'candidate.invalid.title': 'Link not valid',
  'candidate.invalid.body': 'This link doesn’t work. Check you opened the full link from your WhatsApp message.',
  'candidate.issuedOn': 'Issued on',
  'candidate.number': 'Certificate number',
};

type Key = keyof typeof en;

const hi: Record<Key, string> = {
  'lang.toggle': 'English',
  'lang.toggleLabel': 'View in English',
  'brand.programme': 'प्रगति कौशल मिशन',
  'verify.title': 'प्रमाणपत्र सत्यापित करें',
  'verify.subtitle': 'जाँचें कि कौशल प्रमाणपत्र असली है और अभी भी मान्य है। लॉगिन की ज़रूरत नहीं।',
  'verify.inputLabel': 'प्रमाणपत्र संख्या',
  'verify.placeholder': 'PSM-2026-XXXXXXXXXXX',
  'verify.formatHint': 'प्रारूप: PSM-वर्ष-11 अक्षर/अंक। QR कोड के नीचे छपा है।',
  'verify.formatInvalid': 'यह प्रमाणपत्र संख्या जैसी नहीं लगती। यह PSM-2026-7KQ2M9XHRT4 जैसी होनी चाहिए।',
  'verify.button': 'सत्यापित करें',
  'verify.scan': 'QR कोड स्कैन करें',
  'verify.scanStop': 'कैमरा बंद करें',
  'verify.scanHint': 'प्रमाणपत्र पर बने QR कोड की ओर कैमरा रखें।',
  'verify.scanDenied': 'कैमरा की अनुमति नहीं मिली। कृपया संख्या टाइप करें।',
  'verify.scanUnavailable': 'इस डिवाइस पर कैमरा उपलब्ध नहीं है।',
  'verify.scanWrongCode': 'यह CertiFlow का सत्यापन QR कोड नहीं है।',
  'verify.checking': 'जाँच हो रही है…',
  'verify.valid.title': 'मान्य प्रमाणपत्र',
  'verify.valid.body': 'यह प्रमाणपत्र प्रगति कौशल मिशन द्वारा जारी किया गया है और रद्द नहीं किया गया है।',
  'verify.revoked.title': 'यह प्रमाणपत्र अब मान्य नहीं है',
  'verify.revoked.body': 'इसे राज्य कौशल कार्यालय ने रद्द कर दिया है। इसे प्रशिक्षण के प्रमाण के रूप में स्वीकार न करें।',
  'verify.notFound.title': 'कोई प्रमाणपत्र नहीं मिला',
  'verify.notFound.body': 'इस संख्या का कोई प्रमाणपत्र नहीं मिला।',
  'verify.notFound.tip1': 'हर अक्षर ध्यान से जाँचें। I, L, O और U अक्षर कभी इस्तेमाल नहीं होते।',
  'verify.notFound.tip2': 'अगर QR कोड स्कैन करने पर भी यह दिखे, तो प्रमाणपत्र नकली हो सकता है।',
  'verify.rateLimited': 'आपके नेटवर्क से बहुत अधिक जाँचें हुई हैं। कृपया {s} सेकंड बाद फिर कोशिश करें।',
  'verify.error': 'सत्यापन सेवा अभी उपलब्ध नहीं है। कृपया थोड़ी देर बाद कोशिश करें।',
  'verify.holder': 'धारक',
  'verify.course': 'पाठ्यक्रम',
  'verify.centre': 'प्रशिक्षण केंद्र',
  'verify.issued': 'जारी करने की तिथि',
  'verify.revokedOn': 'रद्द करने की तिथि',
  'verify.number': 'प्रमाणपत्र संख्या',
  'verify.pdf.title': 'PDF फ़ाइल जाँचें',
  'verify.pdf.body': 'आपको मिली प्रमाणपत्र PDF चुनें। जाँच इसी डिवाइस पर होती है; फ़ाइल कहीं अपलोड नहीं होती।',
  'verify.pdf.choose': 'PDF चुनें',
  'verify.pdf.match': 'यह फ़ाइल मूल प्रमाणपत्र से पूरी तरह मेल खाती है।',
  'verify.pdf.changed': 'इस फ़ाइल में बदलाव किया गया है। यह जारी किया गया मूल प्रमाणपत्र नहीं है।',
  'verify.pdf.checking': 'फ़ाइल जाँची जा रही है…',
  'verify.privacy.title': 'यह पेज क्या दिखाता है',
  'verify.privacy.shows': 'दिखाया जाता है: धारक के आद्याक्षर, पाठ्यक्रम, प्रशिक्षण केंद्र, जारी तिथि और स्थिति।',
  'verify.privacy.hides': 'कभी नहीं दिखाया जाता: फ़ोन नंबर, नामांकन आईडी, जन्मतिथि, अंक या रद्द करने का कारण।',
  'candidate.hello': 'बधाई हो, {name}!',
  'candidate.ready': 'आपका प्रमाणपत्र तैयार है।',
  'candidate.download': 'प्रमाणपत्र डाउनलोड करें (PDF)',
  'candidate.share': 'सत्यापन लिंक साझा करें',
  'candidate.shared': 'लिंक कॉपी हो गया',
  'candidate.verifyNote': 'नियोक्ता यह कोड स्कैन करके या लिंक खोलकर जाँच सकते हैं कि आपका प्रमाणपत्र असली है।',
  'candidate.revoked.title': 'यह प्रमाणपत्र अब मान्य नहीं है',
  'candidate.revoked.body': 'इसे राज्य कौशल कार्यालय ने रद्द कर दिया है। अगर आपको लगता है कि यह गलती है, तो अपने प्रशिक्षण केंद्र से संपर्क करें।',
  'candidate.invalid.title': 'लिंक मान्य नहीं है',
  'candidate.invalid.body': 'यह लिंक काम नहीं कर रहा। जाँचें कि आपने WhatsApp संदेश का पूरा लिंक खोला है।',
  'candidate.issuedOn': 'जारी करने की तिथि',
  'candidate.number': 'प्रमाणपत्र संख्या',
};

type Lang = 'en' | 'hi';
const dictionaries: Record<Lang, Record<Key, string>> = { en, hi };
const STORAGE_KEY = 'certiflow.lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'hi') return saved;
  } catch {
    /* storage blocked: fall through */
  }
  return navigator.language?.toLowerCase().startsWith('hi') ? 'hi' : 'en';
}

interface I18n {
  lang: Lang;
  t: (key: Key, vars?: Record<string, string | number>) => string;
  toggle: () => void;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const t: I18n['t'] = (key, vars) => {
    let s = dictionaries[lang][key] ?? en[key];
    for (const [k, v] of Object.entries(vars ?? {})) s = s.replace(`{${k}}`, String(v));
    return s;
  };
  const toggle = () => {
    const next: Lang = lang === 'en' ? 'hi' : 'en';
    setLang(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* not persisted */
    }
  };
  return (
    <Ctx.Provider value={{ lang, t, toggle }}>
      <div lang={lang}>{children}</div>
    </Ctx.Provider>
  );
}

export function useI18n(): I18n {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n outside I18nProvider');
  return ctx;
}
