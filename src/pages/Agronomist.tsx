import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, CircleHelp, Leaf, LoaderCircle, Send, ShieldCheck, Sprout } from 'lucide-react'
import { useDemo } from '../context/DemoContext'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { AgronomistClientError, askAgronomist, getAgronomistStatus } from '../services/agronomist'
import type { AgronomistResponse, AgronomistStatus } from '../services/agronomist'
import type { AgronomistRequest, EvidenceCategory, Language } from '../../supabase/functions/ai-agronomist/contracts'
import './Agronomist.css'

const copy = {
  en: {
    title: 'Your AI Agronomist', eyebrow: 'UNDERSTAND YOUR LAND', intro: 'Explore your field’s evidence, ask better questions, and understand what still needs to be measured.',
    readOnly: 'Read-only assistant', language: 'Response language', field: 'Your field', select: 'Select a field', season: 'Screening window', spring: 'Spring · March–June', autumn: 'Autumn · September–December', year: 'Historical climate year',
    scope: 'Lebanon & Mediterranean agriculture · Provisional screening, not a complete planting recommendation.',
    signIn: 'Sign in to ask about your own fields.', login: 'Sign in', noFields: 'Add a field to your account to start.', add: 'Add a field', unsynced: 'Save and sync your field before asking. The agronomist uses the saved account data.',
    checking: 'Checking live AI availability…', ready: 'Server configured · ready to ask', unavailable: 'Live AI is unavailable. The server connection needs to be configured.', retryStatus: 'Check connection again',
    welcome: 'A clearer picture of your field', welcomeText: 'I can explain soil, historical climate, water-demand estimates, crop screening, and rotation questions using your saved field evidence and scientific references.',
    question: 'Your agricultural question', placeholder: 'For example: What does my soil pH mean for potatoes?', send: 'Ask agronomist', loading: 'Reviewing your field evidence…', retry: 'Retry question', clear: 'Clear conversation',
    privacy: 'Your question and selected agronomic evidence go to Gemini’s free service. Its terms allow content to be used to improve products. Avoid personal or confidential information. This conversation stays on this page and clears when you switch field or language.',
    evidence: 'Field evidence', evidenceHint: 'Numbers below come from validated entries and calculations. AI explanations refer to these labels.',
    sources: 'Scientific references', missing: 'Missing information', limitations: 'Uncertainty & limits', confidence: 'Low confidence · provisional field screening', next: 'Explore next', you: 'You', agent: 'AgriLumina Agronomist',
    categories: { farmer: 'Farmer-provided', nasa: 'NASA historical estimates', calculated: 'AgriLumina calculated', reference: 'Scientific reference values', unknown: 'Unknown or missing' },
    referenceScope: 'Reference scope', snapshot: 'Evidence computed', cancel: 'Cancel', cancelled: 'Request cancelled. You can ask again.', freeQuota: 'The free AI quota has been reached. Wait for it to reset; no paid fallback will be used.', limit: 'Usage limit reached. Please wait before retrying.', wait: 'Retry after',
    errors: { AUTH_REQUIRED: 'Your session expired. Sign in again.', FIELD_NOT_FOUND: 'This field is not available in your saved account. Review your fields and sync.', FIELD_REVIEW_REQUIRED: 'Review this older example-derived field in My fields first.', INVALID_FIELD: 'Review missing or invalid field inputs in My fields.', UNSUPPORTED_ANSWER: 'The AI answer could not be verified against the available evidence. Rephrase or retry.', INVALID_REQUEST: 'Review your question and selected historical year.', PAYLOAD_TOO_LARGE: 'Shorten your question or clear the conversation before retrying.', TIMEOUT: 'The request timed out. Please retry.', FREE_CONFIGURATION_REQUIRED: 'The server has not confirmed the required free-only configuration.', FREE_ACCESS_UNAVAILABLE: 'Free AI access is unavailable for this account or region. Review the free account setup.', LIMITER_UNAVAILABLE: 'The free usage limiter is unavailable or exhausted. AI requests are paused.', INPUT_LIMIT_EXCEEDED: 'Clear the conversation or shorten the question to fit the free request limit.', WORKSPACE_UNAVAILABLE: 'Your saved account workspace could not be read. Please retry.' },
    suggestions: ['Is my soil suitable for potatoes?', 'Why is wheat ranked above chickpeas?', 'What does my soil pH mean?', 'What does ETo mean for my field?', 'How much irrigation data do I still need?', 'What crops should I investigate next?']
  },
  ar: {
    title: 'مستشارك الزراعي الذكي', eyebrow: 'افهم أرضك', intro: 'استكشف بيانات حقلك وافهم النتائج وما لا يزال بحاجة إلى قياس.',
    readOnly: 'مستشار للقراءة فقط', language: 'لغة الإجابة', field: 'حقلك', select: 'اختر حقلاً', season: 'فترة الفحص', spring: 'الربيع · آذار–حزيران', autumn: 'الخريف · أيلول–كانون الأول', year: 'سنة المناخ التاريخي',
    scope: 'الزراعة في لبنان والمتوسط · فحص أولي، وليس توصية زراعية كاملة.',
    signIn: 'سجّل الدخول للسؤال عن حقولك الخاصة.', login: 'تسجيل الدخول', noFields: 'أضف حقلاً إلى حسابك للبدء.', add: 'إضافة حقل', unsynced: 'احفظ بيانات الحقل وزامنها قبل السؤال. يعتمد المستشار على البيانات المحفوظة في الحساب.',
    checking: 'نتحقق من توفر الذكاء الاصطناعي…', ready: 'الخادم مهيّأ · يمكنك السؤال', unavailable: 'الذكاء الاصطناعي غير متاح حالياً. يجب إعداد الاتصال على الخادم.', retryStatus: 'إعادة فحص الاتصال',
    welcome: 'صورة أوضح عن حقلك', welcomeText: 'أساعدك في فهم التربة والمناخ التاريخي وتقديرات الطلب المائي وفحص المحاصيل والدورة الزراعية، بالاعتماد على بيانات حقلك والمراجع العلمية.',
    question: 'سؤالك الزراعي', placeholder: 'مثلاً: شو بتعني حموضة التربة عندي لزراعة البطاطا؟', send: 'اسأل المستشار', loading: 'نراجع أدلة حقلك…', retry: 'إعادة السؤال', clear: 'مسح المحادثة',
    privacy: 'يُرسل سؤالك والبيانات الزراعية المختارة إلى خدمة Gemini المجانية. تسمح شروطها باستخدام المحتوى لتحسين المنتجات. تجنّب المعلومات الشخصية أو السرية. تبقى المحادثة في هذه الصفحة وتُمسح عند تغيير الحقل أو اللغة.',
    evidence: 'أدلة الحقل', evidenceHint: 'الأرقام أدناه من المدخلات والحسابات المتحقق منها. تشير الشروحات إلى هذه العناوين.',
    sources: 'المراجع العلمية', missing: 'المعلومات الناقصة', limitations: 'عدم اليقين والحدود', confidence: 'ثقة منخفضة · فحص أولي للحقل', next: 'استكشف أيضاً', you: 'أنت', agent: 'مستشار AgriLumina الزراعي',
    categories: { farmer: 'بيانات المزارع', nasa: 'تقديرات ناسا التاريخية', calculated: 'حسابات AgriLumina', reference: 'قيم مرجعية علمية', unknown: 'معلومات مجهولة أو ناقصة' },
    referenceScope: 'نطاق المرجع', snapshot: 'وقت حساب الأدلة', cancel: 'إلغاء', cancelled: 'أُلغي الطلب. يمكنك السؤال مجدداً.', freeQuota: 'وصلت إلى حد الذكاء الاصطناعي المجاني. انتظر إعادة ضبط الحصة؛ لن تُستخدم خدمة مدفوعة بديلة.', limit: 'وصلت إلى حد الاستخدام. انتظر قبل المحاولة مجدداً.', wait: 'المحاولة بعد',
    errors: { AUTH_REQUIRED: 'انتهت الجلسة. سجّل الدخول مجدداً.', FIELD_NOT_FOUND: 'الحقل غير متاح في حسابك المحفوظ. راجع الحقول والمزامنة.', FIELD_REVIEW_REQUIRED: 'راجع هذا الحقل القديم المشتق من مثال في صفحة حقولك أولاً.', INVALID_FIELD: 'راجع مدخلات الحقل الناقصة أو غير الصالحة.', UNSUPPORTED_ANSWER: 'تعذر التحقق من الإجابة استناداً إلى الأدلة المتاحة. أعد صياغة السؤال أو حاول مجدداً.', INVALID_REQUEST: 'راجع السؤال والسنة التاريخية المختارة.', PAYLOAD_TOO_LARGE: 'اختصر السؤال أو امسح المحادثة قبل المحاولة مجدداً.', TIMEOUT: 'انتهت مهلة الطلب. حاول مجدداً.', FREE_CONFIGURATION_REQUIRED: 'لم يؤكد الخادم الإعداد المجاني المطلوب.', FREE_ACCESS_UNAVAILABLE: 'الوصول المجاني غير متاح لهذا الحساب أو المنطقة. راجع إعداد الحساب المجاني.', LIMITER_UNAVAILABLE: 'محدد الاستخدام المجاني غير متاح أو نفدت حصته. أُوقفت طلبات الذكاء الاصطناعي مؤقتاً.', INPUT_LIMIT_EXCEEDED: 'امسح المحادثة أو اختصر السؤال ليلائم الحد المجاني.', WORKSPACE_UNAVAILABLE: 'تعذرت قراءة بيانات حسابك المحفوظة. حاول مجدداً.' },
    suggestions: ['هل تربتي مناسبة للبطاطا؟', 'ليش القمح ترتيبه أعلى من الحمص؟', 'شو بتعني حموضة التربة عندي؟', 'شو يعني ETo لحقلي؟', 'شو بعد ناقصني من بيانات الري؟', 'أي محاصيل لازم أدرسها بعد؟']
  }
}
type Copy = typeof copy.en | typeof copy.ar
type Turn = { question: string; response: AgronomistResponse }
function errorText(error: unknown, t: Copy): string {
  if (!(error instanceof AgronomistClientError)) return t.unavailable
  if (['RATE_LIMITED', 'PROVIDER_BUSY', 'FREE_QUOTA_EXHAUSTED'].includes(error.code)) return (error.code === 'FREE_QUOTA_EXHAUSTED' ? t.freeQuota : t.limit) + (error.retryAfter ? ' ' + t.wait + ' ' + new Date(Date.now() + error.retryAfter * 1000).toLocaleTimeString() : '')
  return t.errors[error.code as keyof typeof t.errors] ?? t.unavailable
}
function sourceHref(url: string): string | undefined {
  try { const u = new URL(url); return u.protocol === 'https:' && ['www.fao.org', 'ecocrop.apps.fao.org', 'power.larc.nasa.gov', 'www.mdpi.com', 'www.lari.gov.lb'].includes(u.hostname) ? u.href : undefined }
  catch { return undefined }
}
function Answer({ response, t, onFollowUp }: { response: AgronomistResponse; t: Copy; onFollowUp: (q: string) => void }) {
  const { answer, context, sources } = response
  return <div className="ag-answer">
    {answer.paragraphs.map((p, index) => <div className="ag-paragraph" key={index}><p>{p.text}</p><div className="ag-citations">{p.evidenceIds.map(id => {
      const source = sources.find(s => s.id === id)
      const evidence = context.evidence.find(e => e.id === id)
      return source ? <a key={id} href={sourceHref(source.url)} target="_blank" rel="noopener noreferrer"><BookOpen size={12} />{source.title}</a>
        : evidence ? <span key={id} title={evidence.value}>{evidence.label}: <bdi>{evidence.value}</bdi></span> : null
    })}</div></div>)}
    <p className="ag-confidence"><CircleHelp size={14} />{t.confidence}</p>
    {answer.missingData.length > 0 && <div className="ag-answer-missing"><strong>{t.missing}</strong><ul>{answer.missingData.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
    {answer.followUpQuestions.length > 0 && <div className="ag-followups"><strong>{t.next}</strong>{answer.followUpQuestions.map((q, i) => <button type="button" key={i} onClick={() => onFollowUp(q)}>{q}</button>)}</div>}
  </div>
}
function Conversation({ input, enabled, language, t }: { input: Omit<AgronomistRequest, 'question' | 'history'>; enabled: boolean; language: Language; t: Copy }) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [question, setQuestion] = useState('')
  const [pending, setPending] = useState(false)
  const [attempted, setAttempted] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [retryAt, setRetryAt] = useState(0)
  const [clock, setClock] = useState(Date.now())
  const active = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const end = useRef<HTMLDivElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; active.current?.abort() } }, [])
  useEffect(() => { if (turns.length || pending) end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [turns.length, pending])
  useEffect(() => { if (retryAt <= Date.now()) return; const timer = window.setTimeout(() => setClock(Date.now()), retryAt - Date.now() + 20); return () => clearTimeout(timer) }, [retryAt])
  const last = turns.at(-1)?.response
  const cooldown = clock < retryAt
  async function send(value = question) {
    const trimmed = value.trim()
    if (!enabled || !trimmed || pending || active.current || cooldown || trimmed.length > 1500) return
    const controller = new AbortController()
    active.current = controller
    setPending(true); setError(null); setAttempted(trimmed)
    const history = turns.slice(-2).flatMap(turn => [{ role: 'user' as const, content: turn.question }, { role: 'assistant' as const, content: turn.response.answer.paragraphs.map(p => p.text).join('\n').slice(0, 1800) }])
    try {
      const response = await askAgronomist({ ...input, question: trimmed, history }, controller.signal)
      if (mounted.current && !controller.signal.aborted) { setTurns(old => [...old.slice(-19), { question: trimmed, response }]); setQuestion(''); setRetryAt(0) }
    } catch (failure) {
      if (mounted.current && !controller.signal.aborted) {
        setError(errorText(failure, t))
        if (failure instanceof AgronomistClientError && failure.retryAfter) { setRetryAt(Date.now() + failure.retryAfter * 1000); setClock(Date.now()) }
      }
    } finally { if (mounted.current && active.current === controller) { setPending(false); active.current = null } }
  }
  function cancel() { active.current?.abort(); active.current = null; setPending(false); setError(t.cancelled) }
  function followUp(q: string) { setQuestion(q); textarea.current?.focus() }
  function submit(event: FormEvent) { event.preventDefault(); void send() }
  return <div className="ag-workspace">
    <section className="card ag-chat" aria-label={t.title}>
      <div className="ag-chat-top"><span><Leaf size={18} />{t.agent}</span><button type="button" disabled={pending || !turns.length} onClick={() => { setTurns([]); setError(null); setQuestion('') }}>{t.clear}</button></div>
      <div className="ag-transcript" role="log" aria-label={t.title} aria-relevant="additions">
        {!turns.length && <div className="ag-welcome"><span className="ag-leaf"><Sprout size={34} strokeWidth={1.5} /></span><h2>{t.welcome}</h2><p>{t.welcomeText}</p><div className="ag-suggestions">{t.suggestions.map(q => <button key={q} type="button" onClick={() => followUp(q)}>{q}</button>)}</div></div>}
        {turns.map((turn, i) => <div className="ag-turn" key={i}><div className="ag-question"><strong>{t.you}</strong><p dir="auto">{turn.question}</p></div><article className="ag-response"><strong>{t.agent}</strong><Answer response={turn.response} t={t} onFollowUp={followUp} /></article></div>)}
        {pending && <p className="ag-loading" role="status"><LoaderCircle size={18} className="ag-spin" />{t.loading}</p>}
        <div ref={end} />
      </div>
      <form className="ag-composer" onSubmit={submit}>
        {error && <div className="ag-error" role="alert"><p>{error}</p><button type="button" disabled={!enabled || pending || cooldown || !attempted} onClick={() => { void send(attempted) }}>{t.retry}</button></div>}
        <label htmlFor="ag-question">{t.question}</label>
        <textarea id="ag-question" ref={textarea} dir="auto" rows={3} maxLength={1500} value={question} onChange={e => setQuestion(e.target.value)} placeholder={t.placeholder} disabled={pending} />
        <div className="ag-compose-actions"><span>{question.length} / 1500</span>{pending ? <button className="btn btn-secondary" type="button" onClick={cancel}>{t.cancel}</button> : <button className="btn btn-primary" type="submit" disabled={!enabled || !question.trim() || cooldown}><Send size={15} />{t.send}</button>}</div>
        <p className="ag-privacy">{t.privacy}</p>
      </form>
    </section>
    <aside className="ag-evidence-column" aria-label={t.evidence}>
      <section className="card ag-evidence"><h2><ShieldCheck size={18} />{t.evidence}</h2><p>{t.evidenceHint}</p>
        {last ? <><p className="ag-snapshot">{t.snapshot}: <time dateTime={last.context.snapshot.computedAt}>{new Date(last.context.snapshot.computedAt).toLocaleString(language === 'ar' ? 'ar-LB' : 'en-LB')}</time></p>
          {(Object.keys(t.categories) as EvidenceCategory[]).map(category => <details key={category} open={category === 'farmer' || category === 'unknown'}><summary><span className={'ag-dot ag-dot-' + category} />{t.categories[category]} <span>{last.context.evidence.filter(e => e.category === category).length}</span></summary><dl>{last.context.evidence.filter(e => e.category === category).map(e => <div key={e.id}><dt>{e.label}</dt><dd><bdi>{e.value}</bdi>{e.sourceIds.map(id => { const source = last.sources.find(s => s.id === id); return source ? <a key={id} href={sourceHref(source.url)} target="_blank" rel="noopener noreferrer">{source.title}</a> : null })}</dd></div>)}</dl></details>)}</> : <p className="ag-empty-evidence">{t.welcomeText}</p>}
      </section>
      {last && <>
        <section className="card ag-evidence ag-limits"><h2>{t.limitations}</h2><ul>{last.context.limitations.map((s, i) => <li key={i}>{s}</li>)}</ul><h3>{t.missing}</h3><ul>{last.context.missing.map((s, i) => <li key={i}>{s}</li>)}</ul></section>
        <section className="card ag-evidence"><h2><BookOpen size={18} />{t.sources}</h2>{last.sources.map(s => <details key={s.id}><summary>{s.title}</summary><p>{s.scope}</p><a href={sourceHref(s.url)} target="_blank" rel="noopener noreferrer">{s.title}</a><small>{s.reviewedOn}</small></details>)}</section>
      </>}
    </aside>
  </div>
}
export default function AgronomistPage() {
  const demo = useDemo()
  const { fields, selectedFieldId, setSelectedFieldId, preferences, syncState } = useApp()
  const { user } = useAuth()
  const [language, setLanguage] = useState<Language>(preferences.language)
  const [season, setSeason] = useState<'Spring' | 'Autumn'>('Spring')
  const [year, setYear] = useState(new Date().getFullYear() - 1)
  const [status, setStatus] = useState<AgronomistStatus | null>(null)
  const [statusError, setStatusError] = useState<unknown>(null)
  const [checking, setChecking] = useState(false)
  const [check, setCheck] = useState(0)
  const ownFields = user ? fields.filter(f => !f.archived) : []
  const field = ownFields.find(f => f.id === selectedFieldId) ?? ownFields[0]
  const t = copy[language]
  useEffect(() => {
    setStatus(null); setStatusError(null)
    if (!user) { setChecking(false); return }
    const controller = new AbortController()
    setChecking(true)
    void getAgronomistStatus(controller.signal).then(next => { if (!controller.signal.aborted) setStatus(next) })
      .catch(error => { if (!controller.signal.aborted) setStatusError(error) })
      .finally(() => { if (!controller.signal.aborted) setChecking(false) })
    return () => controller.abort()
  }, [user?.id, check])
  const enabled = !!user && !!field && syncState === 'synced' && status?.available === true
  return <div className="ag-page" dir={language === 'ar' ? 'rtl' : 'ltr'} lang={language}>
    <header className="ag-heading"><div><span className="eyebrow">{t.eyebrow}</span><h1>{t.title}</h1><p>{t.intro}</p></div><div className="ag-heading-tools"><span className="ag-readonly"><ShieldCheck size={15} />{t.readOnly}</span><label>{t.language}<select aria-label={t.language} value={language} onChange={e => setLanguage(e.target.value as Language)}><option value="en">English</option><option value="ar">العربية</option></select></label></div></header>
    <div className="card ag-controls"><label>{t.field}<select aria-label={t.field} value={field?.id ?? ''} disabled={!ownFields.length} onChange={e => setSelectedFieldId(e.target.value)}>{!ownFields.length && <option value="">{t.select}</option>}{ownFields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label><label>{t.season}<select aria-label={t.season} value={season} onChange={e => setSeason(e.target.value as 'Spring' | 'Autumn')}><option value="Spring">{t.spring}</option><option value="Autumn">{t.autumn}</option></select></label><label>{t.year}<input aria-label={t.year} type="number" min={1984} max={new Date().getFullYear() - 1} value={year} onChange={e => setYear(Number(e.target.value))} /></label></div>
    <p className="ag-scope"><CircleHelp size={15} />{t.scope}</p>
    {demo.active ? <div className="notice notice-info" role="status">AI Agronomist is unavailable in local Demo Mode. It requires a real signed-in account and a configured server. Synthetic records are never sent to it.</div> : !user ? <div className="notice notice-info">{t.signIn} <Link to="/login">{t.login}</Link></div> : !field ? <div className="notice notice-info">{t.noFields} <Link to="/fields/new">{t.add}</Link></div> : syncState !== 'synced' && <div className="notice notice-warning">{t.unsynced}</div>}
    {user && <div className={'ag-availability ' + (status?.available ? 'ag-ready' : 'ag-offline')} role="status"><span className={'ag-dot ' + (status?.available ? 'ag-dot-calculated' : 'ag-dot-unknown')} /><span>{checking ? t.checking : status?.available ? t.ready : statusError ? errorText(statusError, t) : t.unavailable}</span>{!checking && <button type="button" onClick={() => setCheck(v => v + 1)}>{t.retryStatus}</button>}</div>}
    <Conversation key={(user?.id ?? 'guest') + ':' + (field?.id ?? '') + ':' + language + ':' + season + ':' + year} input={{ fieldId: field?.id ?? '', language, season, climateYear: year }} enabled={enabled && Number.isInteger(year) && year >= 1984 && year < new Date().getFullYear()} language={language} t={t} />
  </div>
}
