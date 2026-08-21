import { useState } from "react";
import { toast } from "sonner";
import {
  BookOpen, ChevronDown, Copy, ShieldCheck, RefreshCw, AlertTriangle, KeyRound, MousePointerClick,
} from "lucide-react";
import { useApp } from "@/lib/app-context";

type Lang = "ar" | "en";
type Bi = { ar: string; en: string };

const PUBLISHED_ORIGIN = "https://mechatro.hub4tech.net";
const CALLBACK_PATH = "/api/public/google/drive-callback";

const OAUTH_STEPS: Array<{ title: Bi; body: Bi; copy?: { label: Bi; value: string } }> = [
  {
    title: { ar: "أنشئ مشروعاً في Google Cloud", en: "Create a Google Cloud project" },
    body: {
      ar: "افتح console.cloud.google.com ← من القائمة العلوية اختر «Select a project» ← «New project» ← سمّه مثلاً Mechatro Backups ← Create. انتظر حتى يصبح المشروع محدّداً في الأعلى.",
      en: "Open console.cloud.google.com → top bar «Select a project» → «New project» → name it e.g. Mechatro Backups → Create. Wait until the project is selected in the top bar.",
    },
  },
  {
    title: { ar: "فعّل Google Drive API", en: "Enable the Google Drive API" },
    body: {
      ar: "من القائمة الجانبية: APIs & Services ← Library ← ابحث عن «Google Drive API» ← اضغط Enable. بدون هذه الخطوة كل الطلبات ترجع بخطأ «Drive API has not been used».",
      en: "Side menu: APIs & Services → Library → search «Google Drive API» → Enable. Without this every request fails with «Drive API has not been used».",
    },
  },
  {
    title: { ar: "اضبط شاشة الموافقة (OAuth consent screen)", en: "Configure the OAuth consent screen" },
    body: {
      ar: "APIs & Services ← OAuth consent screen ← اختر External ← املأ اسم التطبيق وبريد الدعم ← في صفحة Scopes أضف نطاق drive.file ← في صفحة Test users أضف بريد Google الذي سترفع النسخ إلى حسابه (مهم جداً وإلا سيظهر access_denied).",
      en: "APIs & Services → OAuth consent screen → choose External → fill app name and support email → on Scopes add drive.file → on Test users add the Google account that will own the backups (critical, otherwise you get access_denied).",
    },
    copy: { label: { ar: "النطاق المطلوب (Scope)", en: "Required scope" }, value: "https://www.googleapis.com/auth/drive.file" },
  },
  {
    title: { ar: "أنشئ OAuth Client ID", en: "Create an OAuth Client ID" },
    body: {
      ar: "APIs & Services ← Credentials ← Create credentials ← OAuth client ID ← Application type: Web application ← سمّه Mechatro App.",
      en: "APIs & Services → Credentials → Create credentials → OAuth client ID → Application type: Web application → name it Mechatro App.",
    },
  },
  {
    title: { ar: "أضف عنوان الإرجاع (Authorized redirect URI)", en: "Add the authorized redirect URI" },
    body: {
      ar: "في نفس نافذة الإنشاء، تحت «Authorized redirect URIs» اضغط ADD URI والصق العنوان أدناه حرفياً (بدون / في النهاية). أضف عنوان النطاق المنشور وعنوان النطاق الحالي إن اختلفا. أي فرق بحرف واحد يسبّب خطأ redirect_uri_mismatch.",
      en: "In the same dialog, under «Authorized redirect URIs» click ADD URI and paste the value below exactly (no trailing slash). Add both the published and the current origin if they differ. A single character difference causes redirect_uri_mismatch.",
    },
  },
  {
    title: { ar: "احفظ Client ID و Client Secret", en: "Save the Client ID and Secret" },
    body: {
      ar: "بعد الضغط على Create ستظهر لك قيمتان: Client ID و Client Secret. انسخهما الآن (السرّ لا يظهر لاحقاً بشكل كامل).",
      en: "After clicking Create you get two values: Client ID and Client Secret. Copy both now (the secret is not shown again in full).",
    },
  },
  {
    title: { ar: "أضف القيمتين إلى أسرار النظام", en: "Add both values to the app secrets" },
    body: {
      ar: "تُخزَّن القيمتان في بيئة الخادم بالاسمين أدناه. على السيرفر الذاتي أضفهما إلى بيئة دالة backup-snapshot ثم أعد نشرها عبر scripts/deploy-edge-functions.sh.",
      en: "Both values live in the server environment under the names below. On the self-hosted server add them to the backup-snapshot function environment, then redeploy with scripts/deploy-edge-functions.sh.",
    },
    copy: { label: { ar: "أسماء الأسرار", en: "Secret names" }, value: "GOOGLE_OAUTH_CLIENT_ID\nGOOGLE_OAUTH_CLIENT_SECRET" },
  },
  {
    title: { ar: "اضغط «الربط بحساب Google»", en: "Click «Connect with Google»" },
    body: {
      ar: "ارجع إلى هذه الصفحة ← زر الربط في أعلى البطاقة ← اختر حساب Google ← اضغط Allow. سترجع تلقائياً إلى الإعدادات مع رسالة نجاح.",
      en: "Come back to this page → the connect button at the top of the card → pick your Google account → Allow. You are redirected back to settings with a success toast.",
    },
  },
  {
    title: { ar: "اختر مجلد النسخ (أو أنشئه)", en: "Pick the backup folder (or create one)" },
    body: {
      ar: "بعد الربط تظهر قائمة مجلدات حسابك. اختر مجلداً أو اكتب اسماً جديداً واضغط «إنشاء مجلد». يمكنك إضافة أكثر من مجلد وستُرفع كل نسخة إلى جميع المجلدات المفعّلة.",
      en: "Once linked, your folder list appears. Pick one or type a new name and press «Create folder». You can add several folders — every backup is uploaded to all enabled ones.",
    },
  },
];



const TROUBLESHOOT: Array<{ symptom: Bi; cause: Bi; fix: Bi }> = [
  {
    symptom: { ar: "redirect_uri_mismatch", en: "redirect_uri_mismatch" },
    cause: { ar: "عنوان الإرجاع في Google لا يطابق عنوان التطبيق حرفياً.", en: "The redirect URI in Google does not match the app URL exactly." },
    fix: { ar: "انسخ العنوان من صندوق «عنوان الإرجاع» أعلاه والصقه كما هو، بدون / في النهاية.", en: "Copy the value from the «Redirect URI» box above and paste it verbatim, with no trailing slash." },
  },
  {
    symptom: { ar: "access_denied عند الموافقة", en: "access_denied on consent" },
    cause: { ar: "التطبيق في وضع Testing وبريدك غير مضاف كـ Test user.", en: "The app is in Testing mode and your email is not a Test user." },
    fix: { ar: "OAuth consent screen ← Test users ← أضف بريدك، أو انشر التطبيق (Publish app).", en: "OAuth consent screen → Test users → add your email, or publish the app." },
  },
  {
    symptom: { ar: "Drive API has not been used", en: "Drive API has not been used" },
    cause: { ar: "Google Drive API غير مفعّل في المشروع.", en: "The Drive API is not enabled on the project." },
    fix: { ar: "APIs & Services ← Library ← Google Drive API ← Enable، ثم انتظر دقيقة.", en: "APIs & Services → Library → Google Drive API → Enable, then wait a minute." },
  },
  {
    symptom: { ar: "File not found عند إضافة المجلد", en: "File not found when adding a folder" },
    cause: { ar: "المعرّف خاطئ أو المجلد غير مشترك مع الحساب المرتبط.", en: "Wrong folder ID, or the folder is not shared with the linked account." },
    fix: { ar: "استخدم قائمة المجلدات داخل التطبيق بدل لصق الرابط، أو شارك المجلد بصلاحية Editor.", en: "Use the in-app folder list instead of pasting a link, or share the folder as Editor." },
  },
  {
    symptom: { ar: "توقّفت المزامنة فجأة (invalid_grant)", en: "Sync stopped suddenly (invalid_grant)" },
    cause: { ar: "انتهت صلاحية Refresh token (تنتهي بعد 7 أيام إذا بقي التطبيق في وضع Testing، أو عند تغيير كلمة مرور Google).", en: "The refresh token expired (7 days while the app stays in Testing mode, or after a Google password change)." },
    fix: { ar: "انشر التطبيق في Google Cloud (Publish app) ثم أعد الربط من هذه الصفحة.", en: "Publish the app in Google Cloud, then reconnect from this page." },
  },
  {
    symptom: { ar: "فشل «تشغيل نسخة تجريبية»", en: "«Run test backup» fails" },
    cause: { ar: "المجلد المستهدف محذوف أو تم سحب صلاحية الحساب المرتبط.", en: "The target folder was deleted, or the linked account lost access." },
    fix: { ar: "احذف المجلد من قائمة الوجهات وأعد اختياره، أو أعد الربط بحساب Google.", en: "Remove the destination and pick it again, or reconnect the Google account." },
  },
];

function CopyBox({ label, value, lang }: { label: string; value: string; lang: Lang }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>{label}</div>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8,
          border: "1px solid var(--border)", background: "var(--surface)",
        }}
      >
        <code
          style={{
            flex: 1, fontSize: 12, direction: "ltr", textAlign: "left",
            whiteSpace: "pre-wrap", wordBreak: "break-all", color: "var(--fg)",
          }}
        >
          {value}
        </code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(value).then(
              () => toast.success(lang === "ar" ? "تم النسخ" : "Copied"),
              () => toast.error(lang === "ar" ? "تعذّر النسخ" : "Copy failed"),
            );
          }}
          title={lang === "ar" ? "نسخ" : "Copy"}
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 30, height: 28, borderRadius: 7, cursor: "pointer",
            border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--fg)",
          }}
        >
          <Copy size={13} />
        </button>
      </div>
    </div>
  );
}

function StepCard({
  index, title, body, children,
}: { index: number; title: string; body: string; children?: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex", gap: 12, padding: 12, borderRadius: 10,
        border: "1px solid var(--border)", background: "var(--surface-2)",
      }}
    >
      <span
        style={{
          flex: "0 0 26px", height: 26, borderRadius: 999, display: "inline-flex",
          alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700,
          background: "rgba(91,214,166,.14)", color: "#5BD6A6", border: "1px solid rgba(91,214,166,.35)",
        }}
      >
        {index}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>{title}</div>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.75, color: "var(--muted)" }}>{body}</p>
        {children}
      </div>
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 style={{ display: "flex", alignItems: "center", gap: 8, margin: "18px 0 10px", fontSize: 14 }}>
      {icon} {children}
    </h3>
  );
}

export function DriveSetupGuide({
  defaultOpen = false,
  accountEmail,
  clientEmail,
}: {
  defaultOpen?: boolean;
  accountEmail?: string | null;
  clientEmail?: string | null;
}) {
  const { lang } = useApp() as { lang: Lang };
  const [open, setOpen] = useState(defaultOpen);
  const ar = lang === "ar";
  const L = (b: Bi) => (ar ? b.ar : b.en);

  const currentOrigin = typeof window === "undefined" ? PUBLISHED_ORIGIN : window.location.origin;
  const redirectValue = Array.from(new Set([PUBLISHED_ORIGIN + CALLBACK_PATH, currentOrigin + CALLBACK_PATH])).join("\n");
  const originsValue = Array.from(new Set([PUBLISHED_ORIGIN, currentOrigin])).join("\n");

  return (
    <section className="brand-card" style={{ padding: 0, marginTop: 16, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "16px 20px",
          background: "transparent", border: "none", color: "var(--fg)", cursor: "pointer",
          textAlign: ar ? "right" : "left",
        }}
      >
        <BookOpen size={18} color="#5BD6A6" />
        <span style={{ flex: 1, fontSize: 16, fontWeight: 700 }}>
          {ar ? "دليل الإعداد الكامل — Google Drive" : "Full setup guide — Google Drive"}
        </span>
        <ChevronDown size={18} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .18s" }} />
      </button>

      {open && (
        <div style={{ padding: "0 20px 20px" }}>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--muted)", lineHeight: 1.8 }}>
            {ar
              ? "الربط يتم بتسجيل الدخول بحساب Google الذي ستُحفظ النسخ في مساحته. اتبع الخطوات مرة واحدة فقط، ثم تعمل المزامنة تلقائياً."
              : "Linking works by signing in with the Google account whose storage will hold the backups. Follow these steps once; syncing then runs automatically."}
          </p>

          <div style={{ padding: 12, borderRadius: 10, border: "1px solid rgba(231,176,58,.35)", background: "rgba(231,176,58,.10)", fontSize: 12.5, color: "#E7B03A", lineHeight: 1.8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
              <MousePointerClick size={15} /> {ar ? "الأهم: أضف بريدك كـ Test user" : "Most important: add your email as a Test user"}
            </div>
            <div style={{ marginTop: 6 }}>
              {ar
                ? "طالما مشروع Google في وضع Testing، لن يسمح لك بالدخول إلا إذا كان بريدك مضافاً في OAuth consent screen ← Audience/Test users. بدون ذلك يظهر خطأ Access blocked / access_denied 403."
                : "While the Google project is in Testing mode, sign-in only works for emails listed under OAuth consent screen → Audience/Test users. Otherwise you get Access blocked / access_denied 403."}
            </div>
          </div>

          <SectionTitle icon={<MousePointerClick size={16} color="#5BD6A6" />}>
            {ar ? "الربط بحساب Google خطوة بخطوة" : "Connect with Google, step by step"}
          </SectionTitle>
          <div style={{ display: "grid", gap: 8 }}>
            {OAUTH_STEPS.map((s, i) => (
              <StepCard key={i} index={i + 1} title={L(s.title)} body={L(s.body)}>
                {s.copy && <CopyBox label={L(s.copy.label)} value={s.copy.value} lang={lang} />}
                {i === 4 && (
                  <>
                    <CopyBox label={ar ? "عنوان الإرجاع (Authorized redirect URIs)" : "Authorized redirect URIs"} value={redirectValue} lang={lang} />
                    <CopyBox label={ar ? "النطاقات المصرّح بها (JavaScript origins)" : "Authorized JavaScript origins"} value={originsValue} lang={lang} />
                  </>
                )}
                {accountEmail && i === OAUTH_STEPS.length - 2 && (
                  <CopyBox label={ar ? "الحساب المرتبط حالياً" : "Currently linked account"} value={accountEmail} lang={lang} />
                )}
              </StepCard>
            ))}
          </div>


          <SectionTitle icon={<RefreshCw size={16} color="#5BD6A6" />}>
            {ar ? "كيف تعمل المزامنة بعد الربط" : "How syncing works once connected"}
          </SectionTitle>
          <ul style={{ margin: 0, paddingInlineStart: 20, fontSize: 12.5, lineHeight: 2, color: "var(--muted)" }}>
            <li>{ar ? "نسخة تلقائية كل 10 أيام، إضافة إلى أي نسخة يدوية تشغّلها من هذه الصفحة." : "An automatic backup every 10 days, plus any manual backup you trigger from this page."}</li>
            <li>{ar ? "كل نسخة = ملف ZIP واحد يحتوي بيانات قاعدة البيانات (JSON) وكل ملفات التخزين." : "Each backup is a single ZIP containing the database data (JSON) and all storage files."}</li>
            <li>{ar ? "يُرفع الملف إلى كل مجلد مفعّل في القائمة أعلاه." : "The file is uploaded to every enabled folder in the list above."}</li>
            <li>{ar ? "يُحتفظ بآخر 12 نسخة في كل مجلد، والأقدم تُحذف تلقائياً." : "The latest 12 backups are kept per folder; older ones are deleted automatically."}</li>
            <li>{ar ? "إذا فشل الرفع، تبقى النسخة محفوظة داخل النظام ويظهر سبب الفشل بجانب المجلد." : "If the upload fails, the backup stays stored in the system and the reason is shown next to the folder."}</li>
          </ul>

          <SectionTitle icon={<AlertTriangle size={16} color="#E7B03A" />}>
            {ar ? "استكشاف الأخطاء" : "Troubleshooting"}
          </SectionTitle>
          <div style={{ display: "grid", gap: 8 }}>
            {TROUBLESHOOT.map((row) => (
              <div key={row.symptom.en} style={{ padding: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#F0676A", direction: "ltr", textAlign: ar ? "right" : "left" }}>{L(row.symptom)}</div>
                <div style={{ marginTop: 5, fontSize: 12.5, color: "var(--muted)" }}>
                  <b>{ar ? "السبب: " : "Cause: "}</b>{L(row.cause)}
                </div>
                <div style={{ marginTop: 3, fontSize: 12.5, color: "var(--muted)" }}>
                  <b>{ar ? "الحل: " : "Fix: "}</b>{L(row.fix)}
                </div>
              </div>
            ))}
          </div>

          <SectionTitle icon={<ShieldCheck size={16} color="#5BD6A6" />}>
            {ar ? "الأمان والخصوصية" : "Security & privacy"}
          </SectionTitle>
          <ul style={{ margin: 0, paddingInlineStart: 20, fontSize: 12.5, lineHeight: 2, color: "var(--muted)" }}>
            <li>{ar ? "مفتاح حساب الخدمة وتوكن Google يُخزَّنان مشفّرين (AES-256-GCM) في الخادم فقط." : "The service-account key and the Google token are stored encrypted (AES-256-GCM) on the server only."}</li>
            <li>{ar ? "لا يمكن قراءتهما من المتصفح إطلاقاً، ولا يظهران في الواجهة ولا في السجلات." : "They are never readable from the browser and never appear in the UI or logs."}</li>
            <li>{ar ? "إعداد Drive وإدارة المجلدات متاحان للمدير الأعلى فقط." : "Drive setup and folder management are restricted to the master admin."}</li>
            <li>{ar ? "نطاق الصلاحية drive.file يعني أن التطبيق يرى فقط الملفات التي أنشأها هو — لا بقية ملفات حسابك." : "The drive.file scope means the app only sees files it created — not the rest of your Drive."}</li>
          </ul>
        </div>
      )}
    </section>
  );
}
