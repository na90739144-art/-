/**
 * Worker کافی‌نت هوشمند (Cloudflare Workers)
 * - جستجو فقط روی فهرست سایت‌های رسمی (OFFICIAL_DOMAINS) انجام می‌شود.
 * - پاسخ فقط بر پایهٔ همان منابع ساخته می‌شود؛ هر لینک خارج از فهرست از متن پاسخ حذف می‌شود.
 * - اگر عدد یا شرط در پاسخ باشد، جملهٔ «ممکن است بعضی از شرایط تغییر کرده باشد…» به انتها اضافه می‌شود.
 * - هرگز رمز، کد پیامکی یا اطلاعات کارت نمی‌خواهد و چیزی را جای کاربر ثبت نمی‌کند.
 *
 * متغیرهای محرمانه (Secrets): GROQ_API_KEY ، TAVILY_API_KEY (اختیاری ولی لازم برای جستجو)
 * متغیرهای معمولی: ALLOWED_ORIGINS (با کاما جدا شود) ، GROQ_MODEL
 */
const OFFICIAL_DOMAINS = ["bmi.ir", "bankmellat.ir", "bsi.ir", "banksepah.ir", "tejaratbank.ir", "bankrefah.ir", "bank-maskan.ir", "bki.ir", "bpi.ir", "sb24.ir", "parsian-bank.ir", "enbank.ir", "postbank.ir", "shahr-bank.ir", "tamin.ir", "tax.gov.ir", "sabteahval.ir", "my.gov.ir", "ikco.ir", "saipa.com", "mci.ir", "irancell.ir", "rightel.ir", "post.ir", "epolice.ir", "moi.ir", "behdasht.gov.ir", "medu.ir", "msrt.ir", "moe.gov.ir", "mrud.ir", "mfa.ir", "mefa.ir", "mimt.gov.ir", "ict.gov.ir", "mcls.gov.ir", "maj.ir", "mop.ir", "msy.gov.ir", "farhang.gov.ir", "judiciary.ir", "majlis.ir", "president.ir", "mpo.ir", "irica.gov.ir", "fda.gov.ir", "irimo.ir", "ssaa.ir", "amar.org.ir", "behzisti.ir", "emdad.ir", "hajj.ir", "cao.ir", "rai.ir", "rmto.ir", "pmo.ir", "doe.ir", "chto.ir", "tehran.ir", "ito.gov.ir", "irimc.org", "lmo.ir", "isiri.gov.ir", "ncc.gov.ir", "enamad.ir", "nic.ir", "shaparak.ir", "oghaf.ir", "irib.ir", "cbi.ir", "ba24.ir", "bank-day.ir", "sinabank.ir", "tourismbank.ir", "ghbi.ir", "ttbank.ir", "bim.ir", "edbi.ir", "karafarinbank.ir", "qmb.ir", "rqbank.ir", "blubank.com", "asanpardakht.ir", "zarinpal.com", "nobitex.ir", "wallex.ir", "tsetmc.com", "ifb.ir", "codal.ir", "seo.ir", "centinsur.ir", "biran.ir", "dana-insurance.com", "bimehmellat.ir", "pic.ir", "azki.com", "bimebazar.com", "ut.ac.ir", "sharif.edu", "aut.ac.ir", "iust.ac.ir", "sbu.ac.ir", "modares.ac.ir", "um.ac.ir", "ui.ac.ir", "shirazu.ac.ir", "tabrizu.ac.ir", "atu.ac.ir", "alzahra.ac.ir", "kntu.ac.ir", "iau.ir", "pnu.ac.ir", "uast.ac.ir", "cfu.ac.ir", "tums.ac.ir", "sbmu.ac.ir", "iums.ac.ir", "mums.ac.ir", "tbzmed.ac.ir", "sums.ac.ir", "mui.ac.ir", "guilan.ac.ir", "uok.ac.ir", "urmia.ac.ir", "umz.ac.ir", "znu.ac.ir", "uk.ac.ir", "yazd.ac.ir", "razi.ac.ir", "lu.ac.ir", "basu.ac.ir", "birjand.ac.ir", "semnan.ac.ir", "khu.ac.ir", "scu.ac.ir", "iut.ac.ir", "sutech.ac.ir", "nit.ac.ir", "shad.ir", "faradars.org", "maktabkhooneh.org", "iranpaper.ir", "civilica.com", "noormags.ir", "noorlib.ir", "magiran.com", "isc.ac", "irandoc.ac.ir", "nlai.ir", "fa.wikipedia.org", "ganjoor.net", "vajehyab.com", "ihio.gov.ir", "sejam.ir", "samanehom.ir", "adliran.ir", "sanjesh.org", "ilenc.ir", "irisl.net"];
const DISCLAIMER = 'ممکن است بعضی از شرایط تغییر کرده باشد؛ لطفاً از سایت رسمی تأیید کنید.';
const SENSITIVE = /رمز\s*(?:پویا|عبور|کارت|دوم)|cvv2|کد\s*پیامک|\botp\b|\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/i;
const NEEDS_NOTE = /[0-9۰-۹]|هزینه|مهلت|شرایط|مدارک|تومان|ریال|درصد|سقف|سن|روز|ماه/;

const isOfficial = (host) => { host = (host || '').toLowerCase(); return OFFICIAL_DOMAINS.some(d => host === d || host.endsWith('.' + d)); };
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };

function cors(env, origin) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  const ok = !allowed.length || (origin && allowed.includes(origin));
  return { ok, headers: {
    'Access-Control-Allow-Origin': ok && origin ? origin : (allowed[0] || '*'),
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  } };
}

// محدودیت ساده برای هر IP (در حافظهٔ همان نمونه؛ برای محدودیت سخت‌تر از Rate Limiting کلودفلر استفاده کنید)
const hits = new Map();
function limited(ip) {
  const now = Date.now(), arr = (hits.get(ip) || []).filter(t => now - t < 60000);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > 15;
}

async function searchOfficial(env, query) {
  if (!env.TAVILY_API_KEY) return [];
  try {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.TAVILY_API_KEY },
      body: JSON.stringify({ query, include_domains: OFFICIAL_DOMAINS, max_results: 5, search_depth: 'basic' })
    });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.results || [])
      .filter(x => x && typeof x.url === 'string' && x.url.startsWith('https://') && isOfficial(hostOf(x.url)))
      .slice(0, 5)
      .map(x => ({ title: String(x.title || hostOf(x.url)).slice(0, 120), url: x.url, content: String(x.content || '').slice(0, 800) }));
  } catch { return []; }
}

function cleanAnswer(text) {
  return text
    .replace(/https?:\/\/[^\s)\]»"]+/g, (u) => isOfficial(hostOf(u)) ? u : '[لینک غیررسمی حذف شد]')
    .trim();
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const c = cors(env, origin);
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: c.headers });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: c.headers });
    const url = new URL(request.url);
    if (url.pathname !== '/api/chat') return json({ error: 'not_found' }, 404);
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    if (!c.ok) return json({ error: 'origin_not_allowed' }, 403);
    if (!env.GROQ_API_KEY) return json({ error: 'service_not_configured' }, 503);
    if (limited(request.headers.get('CF-Connecting-IP') || 'x')) return json({ error: 'rate_limited', answer: 'تعداد درخواست‌ها زیاد بود. چند لحظه بعد دوباره تلاش کنید.' }, 429);

    let body; try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message || message.length > 1500) return json({ error: 'message_length_invalid' }, 400);
    if (SENSITIVE.test(message)) return json({ error: 'sensitive_information_blocked', answer: 'لطفاً رمزها، کدهای پیامکی و اطلاعات کارت را ارسال نکنید. این اطلاعات را فقط در سایت رسمی وارد کنید.' }, 400);
    const context = typeof body.context === 'string' ? body.context.slice(0, 80) : '';
    const history = Array.isArray(body.history) ? body.history.slice(-6)
      .filter(h => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
      .map(h => ({ role: h.role, content: h.content.slice(0, 500) })) : [];

    const found = await searchOfficial(env, (context ? context + ' ' : '') + message);
    const sourcesText = found.length
      ? found.map((s, i) => '[' + (i + 1) + '] ' + s.title + ' (' + hostOf(s.url) + ')\n' + s.content).join('\n\n')
      : '(هیچ منبع رسمی‌ای پیدا نشد)';

    const system = [
      'تو «کافی‌نت هوشمند» هستی؛ دستیار فارسی برای راهنمایی خدمات اداری و اینترنتی ایران.',
      'فقط از «منابع رسمی» زیر برای هر عدد، هزینه، مهلت، شرط و مدرک استفاده کن. اگر منبع آن را نگفته، صریح بگو «در منبع رسمی پیدا نکردم» و کاربر را به سایت رسمی همان سازمان بفرست؛ هرگز عدد یا شرط از خودت نساز.',
      'هیچ لینکی جز لینک‌های همین منابع نده. نام سازمان رسمی مربوط را بگو.',
      'هرگز رمز، رمز پویا، کد پیامکی، CVV یا شماره کارت درخواست نکن. وارد حساب کاربر نشو و چیزی را جای او ثبت نکن؛ همهٔ ورود اطلاعات را خود کاربر روی سایت رسمی انجام می‌دهد.',
      context ? 'کاربر می‌خواهد در سایت مربوط به «' + context + '» قدم‌به‌قدم راهنمایی شود؛ مرحله‌به‌مرحله و کوتاه بگو چه بزند و چه بنویسد، و بپرس به کدام مرحله رسیده.' : '',
      'پاسخ را به فارسی روان، کوتاه و مناسب خواندن با صدا بنویس (جمله‌های کوتاه، بدون جدول و علامت‌های اضافه).',
      'منابع رسمی:\n' + sourcesText
    ].filter(Boolean).join('\n');

    try {
      const up = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + env.GROQ_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: env.GROQ_MODEL || 'llama-3.3-70b-versatile', temperature: 0.2, max_tokens: 800,
          messages: [{ role: 'system', content: system }, ...history, { role: 'user', content: message }]
        })
      });
      if (!up.ok) return json({ error: 'upstream_unavailable' }, 502);
      const data = await up.json();
      let answer = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (typeof answer !== 'string' || !answer.trim()) return json({ error: 'empty_answer' }, 502);
      answer = cleanAnswer(answer);
      if (NEEDS_NOTE.test(answer) && !answer.includes('تغییر کرده باشد')) answer += '\n\n' + DISCLAIMER;
      return json({ answer, sources: found.map(s => ({ title: s.title, url: s.url })) });
    } catch { return json({ error: 'service_unavailable' }, 502); }
  }
};
