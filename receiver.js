/* 受付の保存結果を確認し、フォーム内に表示する。 */
(() => {
  'use strict';
  const endpoint = 'https://script.google.com/macros/s/AKfycbwzWJG-N5DHydBzOLgXtcJFS85qNCgtdX2Gs-0H8k9SSNfVtpysYQZGamRxNilWTz2m/exec';
  const requests = new WeakMap();
  function status(el, text, state) {
    let note = el.querySelector('[role="status"]');
    if (!note) { note = document.createElement('p'); note.setAttribute('role','status'); el.append(note); }
    note.className = 'receiver-status';
    note.dataset.state = state;
    note.textContent = text;
  }
  function busy(el, active) {
    el.setAttribute('aria-busy', String(active));
    el.querySelectorAll('button').forEach(button => {
      if (active) { button.dataset.originalText = button.textContent; button.disabled = true; button.textContent = '送信中…'; }
      else { button.disabled = false; button.textContent = button.dataset.originalText || button.textContent; }
    });
  }
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function finishDelivery(el, pending, baseMessage, email) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(endpoint, {
          method:'POST', credentials:'omit', redirect:'follow', keepalive:true,
          body:new URLSearchParams({action:'notify', requestId:pending.requestId, email, format:'json'}),
        });
        if (!response.ok) throw new Error('unconfirmed');
        const result = await response.json();
        if (!result.saved || result.receipt !== pending.requestId || !result.notified || !result.confirmationSent) throw new Error('unconfirmed');
        pending.message = baseMessage + ' ご入力のメールアドレスへ受付完了メールを送信しました。 受付番号：' + result.receipt;
        pending.state = 'success'; status(el, pending.message, pending.state); return;
      } catch (_) {
        if (attempt < 2) await delay(700 * (attempt + 1));
      }
    }
    pending.message = baseMessage + ' 受付内容は保存されていますが、メール通知を確認できていません。お急ぎの場合は info@package-inc.com へご連絡ください。 受付番号：' + pending.requestId;
    pending.state = 'warning'; status(el, pending.message, pending.state);
  }
  async function submitElement(el) {
    if (el.getAttribute('aria-busy') === 'true') return;
    const value = selector => el.querySelector(selector)?.value?.trim() || '';
    const kind = el.matches('.s-email-form') ? 'contact' : el.matches('.s-blog-subscription') ? 'subscription' : 'comment';
    if (kind === 'subscription' && !el.querySelector('[name="readerConsent"]:checked')) {
      status(el, '読者登録申請への同意にチェックしてください。', 'error'); return;
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
      status(el, 'お名前・メールアドレス・本文を確認してください。', 'error'); return;
    }
    const fingerprint = JSON.stringify(fields);
    let pending = requests.get(el);
    if (!pending || pending.fingerprint !== fingerprint) {
      pending = {fingerprint, requestId: crypto.randomUUID()}; requests.set(el, pending);
    }
    if (pending.completed) { status(el, pending.message, pending.state); return; }
    busy(el, true); status(el, '送信しています。このままお待ちください。', 'sending');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(endpoint, {
        method:'POST', credentials:'omit', redirect:'follow', signal:controller.signal,
        body:new URLSearchParams({...fields, action:'save', requestId:pending.requestId, format:'json'}),
      });
      if (!response.ok) throw new Error('unconfirmed');
      const result = await response.json();
      if (!result.saved || result.receipt !== pending.requestId || result.kind !== kind || typeof result.notified !== 'boolean' || typeof result.confirmationSent !== 'boolean' || typeof result.deliveryPending !== 'boolean') throw new Error('unconfirmed');
      const baseMessage = kind === 'comment' ? 'コメントを受け付けました。内容確認後に掲載します。' :
        kind === 'subscription' ? '読者登録の申請を受け付けました。配信開始までに確認が必要です。' :
          'お問い合わせを受け付けました。内容を確認のうえ、担当者からご連絡します。';
      pending.completed = true;
      if (result.deliveryPending) {
        pending.message = baseMessage + ' 受付完了メールを送信しています。 受付番号：' + result.receipt;
        pending.state = 'success'; status(el, pending.message, pending.state);
        void finishDelivery(el, pending, baseMessage, fields.email);
      } else {
        pending.message = baseMessage + (result.notified && result.confirmationSent ? ' ご入力のメールアドレスへ受付完了メールを送信しました。' : ' メール通知を確認できていません。') + ' 受付番号：' + result.receipt;
        pending.state = result.notified && result.confirmationSent ? 'success' : 'warning'; status(el, pending.message, pending.state);
      }
    } catch (_) {
      status(el, '受付結果を確認できませんでした。入力内容は残っています。そのまま再度送信してください。お急ぎの場合は info@package-inc.com へご連絡ください。', 'error');
    } finally { clearTimeout(timer); busy(el, false); }
  }
  window.OecuhobogReceiver = Object.freeze({submitElement});
})();
