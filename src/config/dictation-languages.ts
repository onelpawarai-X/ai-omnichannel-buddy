/**
 * Dictation languages and their matching narration voice.
 *
 * The browser recogniser is told one BCP-47 tag per language; the recogniser
 * does not detect language itself, so the tag is the whole signal. Each entry
 * also names a ZYRAXON voice for narration in the same language, which keeps
 * the two speech directions paired.
 */
export interface DictationLanguage {
  /** BCP-47 tag handed to the browser recogniser. */
  readonly code: string;
  readonly label: string;
  /** ZYRAXON voice used when narrating in this language. */
  readonly voice: string;
}

export const DICTATION_LANGUAGES: readonly DictationLanguage[] = [
  { code: "bn-BD", label: "বাংলা (বাংলাদেশ)", voice: "bn-BD-NabanitaNeural" },
  { code: "bn-IN", label: "বাংলা (ভারত)", voice: "bn-IN-TanishaaNeural" },
  { code: "en-US", label: "English (United States)", voice: "en-US-AriaNeural" },
  { code: "en-GB", label: "English (United Kingdom)", voice: "en-GB-SoniaNeural" },
  { code: "en-IN", label: "English (India)", voice: "en-IN-NeerjaNeural" },
  { code: "hi-IN", label: "हिन्दी", voice: "hi-IN-SwaraNeural" },
  { code: "ur-PK", label: "اردو", voice: "ur-PK-UzmaNeural" },
  { code: "ar-SA", label: "العربية", voice: "ar-SA-ZariyahNeural" },
  { code: "es-ES", label: "Español", voice: "es-ES-ElviraNeural" },
  { code: "fr-FR", label: "Français", voice: "fr-FR-DeniseNeural" },
  { code: "de-DE", label: "Deutsch", voice: "de-DE-KatjaNeural" },
  { code: "it-IT", label: "Italiano", voice: "it-IT-ElsaNeural" },
  { code: "pt-BR", label: "Português (Brasil)", voice: "pt-BR-FranciscaNeural" },
  { code: "ru-RU", label: "Русский", voice: "ru-RU-SvetlanaNeural" },
  { code: "uk-UA", label: "Українська", voice: "uk-UA-PolinaNeural" },
  { code: "nl-NL", label: "Nederlands", voice: "nl-NL-ColetteNeural" },
  { code: "pl-PL", label: "Polski", voice: "pl-PL-ZofiaNeural" },
  { code: "sv-SE", label: "Svenska", voice: "sv-SE-SofieNeural" },
  { code: "tr-TR", label: "Türkçe", voice: "tr-TR-EmelNeural" },
  { code: "fa-IR", label: "فارسی", voice: "fa-IR-DilaraNeural" },
  { code: "he-IL", label: "עברית", voice: "he-IL-HilaNeural" },
  { code: "el-GR", label: "Ελληνικά", voice: "el-GR-AthinaNeural" },
  { code: "th-TH", label: "ไทย", voice: "th-TH-PremwadeeNeural" },
  { code: "vi-VN", label: "Tiếng Việt", voice: "vi-VN-HoaiMyNeural" },
  { code: "id-ID", label: "Bahasa Indonesia", voice: "id-ID-GadisNeural" },
  { code: "ja-JP", label: "日本語", voice: "ja-JP-NanamiNeural" },
  { code: "ko-KR", label: "한국어", voice: "ko-KR-SunHiNeural" },
  { code: "zh-CN", label: "中文 (普通话)", voice: "zh-CN-XiaoxiaoNeural" },
  { code: "ta-IN", label: "தமிழ்", voice: "ta-IN-PallaviNeural" },
  { code: "te-IN", label: "తెలుగు", voice: "te-IN-ShrutiNeural" },
  { code: "ml-IN", label: "മലയാളം", voice: "ml-IN-SobhanaNeural" },
  { code: "kn-IN", label: "ಕನ್ನಡ", voice: "kn-IN-SapnaNeural" },
  { code: "gu-IN", label: "ગુજરાતી", voice: "gu-IN-DhwaniNeural" },
  { code: "mr-IN", label: "मराठी", voice: "mr-IN-AarohiNeural" },
];

export const DEFAULT_DICTATION_LANGUAGE = "bn-BD";

/** The narration voice paired with a dictation language, if we know one. */
export function voiceForLanguage(code: string): string {
  return (
    DICTATION_LANGUAGES.find((language) => language.code === code)?.voice ??
    "en-US-AriaNeural"
  );
}

export function isDictationLanguage(code: string): boolean {
  return DICTATION_LANGUAGES.some((language) => language.code === code);
}
