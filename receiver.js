/* GAS 受付接続。実際の接続先は prepare-receiver-preview.py で設定する。 */
(() => {
  'use strict';
  const endpoint = "https://script.google.com/macros/s/AKfycbz26G8W0ivNCaDb_bs7KqIKNkutZUgAIXsdKv1lt3A7K4m26CS2Tzop9Micz6wR1MrV/exec";
  const previous = new WeakMap();
  function status(el, text) {
    let note = el.querySelector('[role="status"]');
    if (!note) { note = document.createElement('p'); note.setAttribute('role','status'); el.append(note); }
    note.textContent = text;
  }
  function submitElement(el) {
    if (!/^https:\/\/script\.google\.com\/(?:a\/macros\/package-inc\.com|macros)\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint)) {
      status(el, 'フォームの受付は準備中です。info@package-inc.comへメールでお問い合わせください。');
      return;
    }
    const value = selector => el.querySelector(selector)?.value?.trim() || '';
    const kind = el.matches('.s-email-form') ? 'contact' : el.matches('.s-blog-subscription') ? 'subscription' : 'comment';
    if (kind === 'subscription' && !el.querySelector('[name="readerConsent"]:checked')) {
      status(el, '読者登録申請への同意にチェックしてください。'); return;
    }
    const fields = {
      kind,
      name: kind === 'contact' ? value('[aria-label="お名前"]') : value('[name="name"]'),
      email: kind === 'contact' ? value('[aria-label="メールアドレス"]') : kind === 'subscription' ? value('.s-blog-subscription-email') : value('[name="email"]'),
      phone: kind === 'contact' ? value('[aria-label="電話番号"]') : '',
      message: kind === 'contact' ? value('[aria-label="本文"]') : value('[name="content"]'),
      page: document.querySelector('link[rel="canonical"]').href,
      consent: kind === 'subscription' ? 'yes' : '',
      website: value('[name="website"]'),
    };
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(fields.email) || (kind !== 'subscription' && (!fields.name || !fields.message))) {
      status(el, 'お名前・メールアドレス・本文を確認してください。'); return;
    }
    const fingerprint = JSON.stringify(fields);
    let pending = previous.get(el);
    if (!pending || pending.fingerprint !== fingerprint) { pending = {fingerprint, requestId: crypto.randomUUID()}; previous.set(el,pending); }
    fields.requestId = pending.requestId;
    const form = document.createElement('form');
    form.action = endpoint; form.method = 'POST'; form.target = '_blank'; form.rel = 'noopener'; form.hidden = true;
    for (const [name, value] of Object.entries(fields)) {
      const input = document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input);
    }
    document.body.append(form);
    form.submit();
    form.remove();
    status(el, '別のタブに受付結果が表示されます。受付番号が表示されていることをご確認ください。');
  }
  window.OecuhobogReceiver = Object.freeze({submitElement});
})();
