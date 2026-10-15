/* 受付の保存結果を確認し、フォーム内に表示する。 */
(() => {
  'use strict';
  const endpoint = 'https://script.google.com/macros/s/AKfycbwzWJG-N5DHydBzOLgXtcJFS85qNCgtdX2Gs-0H8k9SSNfVtpysYQZGamRxNilWTz2m/exec';
  const requests = new WeakMap();
  let securityConfig, turnstileScript;
  function verificationError(code) {
    const error=new Error('verification_failed');error.verificationCode=code;return error;
  }
  function bounded(promise,ms,code) {
    return new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(verificationError(code)),ms);
      promise.then(value=>{clearTimeout(timeout);resolve(value);},()=>{clearTimeout(timeout);reject(verificationError(code));});
    });
  }
  async function requestHumanProof(el,kind,requestId) {
    securityConfig ||= bounded(fetch('/receiver-security.json',{credentials:'omit',cache:'no-store'}).then(async r=>{
      if(!r.ok)throw Error('verification_unavailable');
      const c=await r.json();
      if(!/^0x[A-Za-z0-9_-]{10,100}$/.test(c.turnstileSiteKey||''))throw Error('verification_unconfigured');
      return c;
    }),20000,'configuration_unavailable').catch(error=>{securityConfig=null;throw error;});
    const config=await securityConfig;
    if(!window.turnstile) {
      turnstileScript ||= bounded(new Promise((resolve,reject)=>{
        const script=document.createElement('script');
        script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async=true;script.onload=resolve;script.onerror=reject;document.head.append(script);
      }),20000,'script_unavailable').catch(error=>{turnstileScript=null;throw error;});
      await turnstileScript;
    }
    if(!window.turnstile||typeof window.turnstile.ready!=='function')throw verificationError('sdk_unavailable');
    await bounded(new Promise(resolve=>window.turnstile.ready(resolve)),10000,'sdk_not_ready');
    let box=el.querySelector('.receiver-human-check');
    if(!box){box=document.createElement('div');box.className='receiver-human-check';el.append(box);}
    return new Promise((resolve,reject)=>{
      let widget,settled=false;
      const finish=(error,token,code)=>{
        if(settled)return;settled=true;clearTimeout(timeout);
        if(widget!==undefined)window.turnstile.remove(widget);
        error?reject(verificationError(code||'challenge_failed')):resolve(token);
      };
      const timeout=setTimeout(()=>finish(true,undefined,'challenge_timeout'),120000);
      try { widget=window.turnstile.render(box,{sitekey:config.turnstileSiteKey,action:kind,cData:requestId,
        callback:token=>finish(false,token),'error-callback':code=>{finish(true,undefined,/^[0-9]{6}$/.test(String(code))?'challenge_'+code:'challenge_failed');return true;},
        'expired-callback':()=>finish(true,undefined,'challenge_expired'),'timeout-callback':()=>finish(true,undefined,'challenge_timeout')}); } catch (_) {finish(true,undefined,'widget_unavailable');}
    });
  }

  function status(el, text, state) {
    let note = el.querySelector('[role="status"]');
    if (!note) { note = document.createElement('p'); note.setAttribute('role','status'); el.append(note); }
    note.className = 'receiver-status';
    note.dataset.state = state;
    note.textContent = text;
  }
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const receiptNote = ' 現在、受付完了メールの自動送信を停止しています。受付番号をお控えください。';
  function completeMessage(baseMessage, result) {
    return (result.underReview ? '受付内容を保存しました。内容を確認してから対応します。' : baseMessage) +
      (result.kind === 'subscription' ? ' 確認メールが届いた場合は、48時間以内にリンク先で登録を確定してください。登録済みの場合は確認メールを再送しません。' : result.receiptPolicy === 'disabled' ? receiptNote :
        result.confirmationSent ? ' ご入力のメールアドレスへ受付完了メールを送信しました。' : ' メール通知を確認できていません。') +
      ' 受付番号：' + result.receipt;
  }
  async function finishDelivery(el, pending, baseMessage, email) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(endpoint, {
          method:'POST', credentials:'omit', redirect:'follow', keepalive:true,
          body:new URLSearchParams({action:'notify', requestId:pending.requestId, email, format:'json'}),
        });
        if (!response.ok) throw new Error('unconfirmed');
        const result = await response.json();
        if (!result.saved || result.receipt !== pending.requestId ||
          !(result.underReview || result.notified && (result.confirmationSent || result.subscriptionHandled || result.receiptPolicy === 'disabled'))) throw new Error('unconfirmed');
        pending.message = completeMessage(baseMessage, result);
        pending.state = 'success'; status(el, pending.message, pending.state); return;
      } catch (_) {
        if (attempt < 2) await delay(700 * (attempt + 1));
      }
    }
    pending.message = baseMessage + ' 受付内容は保存されていますが、メール通知を確認できていません。お急ぎの場合は info@package-inc.com へご連絡ください。 受付番号：' + pending.requestId;
    pending.state = 'warning'; status(el, pending.message, pending.state);
  }
  async function submitElement(el) {
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
    if (pending.inFlight) { status(el, pending.message, pending.state); return; }
    if (pending.completed) { status(el, pending.message, pending.state); return; }
    pending.inFlight = true;
    pending.message = '送信操作を受け付けました。受付番号を確認しています。';
    pending.state = 'sending';
    el.setAttribute('aria-busy', 'true');
    status(el, pending.message, pending.state);
    const controller = new AbortController();
    let timer;
    try {
      status(el, '送信前の確認をしています。確認画面が出た場合は操作してください。', 'sending');
      const humanToken = await requestHumanProof(el,kind,pending.requestId);
      timer = setTimeout(() => controller.abort(), 45000);
      const response = await fetch(endpoint, {
        method:'POST', credentials:'omit', redirect:'follow', signal:controller.signal, keepalive:true,
        body:new URLSearchParams({...fields, humanToken, action:'save', requestId:pending.requestId, format:'json'}),
      });
      if (!response.ok) throw new Error('unconfirmed');
      const result = await response.json();
      if (!result.saved || result.receipt !== pending.requestId || result.kind !== kind || typeof result.notified !== 'boolean' || typeof result.confirmationSent !== 'boolean' || typeof result.deliveryPending !== 'boolean') throw new Error('unconfirmed');
      const baseMessage = kind === 'comment' ? 'コメントを受け付けました。内容確認後に掲載します。' :
        kind === 'subscription' ? '読者登録の申請を受け付けました。確認メールのリンク先で登録を確定すると、新しい記事をメールでお知らせします。' :
          'お問い合わせを受け付けました。内容を確認のうえ、担当者からご連絡します。';
      pending.completed = true;
      if (result.deliveryPending) {
        pending.message = baseMessage + (result.receiptPolicy === 'disabled' ? ' 担当者への通知を確認しています。' : ' 受付完了メールを送信しています。') + ' 受付番号：' + result.receipt;
        pending.state = 'success'; status(el, pending.message, pending.state);
        void finishDelivery(el, pending, baseMessage, fields.email);
      } else {
        pending.message = completeMessage(baseMessage, result);
        pending.state = result.underReview || result.notified && (result.confirmationSent || result.subscriptionHandled || result.receiptPolicy === 'disabled') ? 'success' : 'warning'; status(el, pending.message, pending.state);
      }
    } catch (error) {
      const code=/^(configuration_unavailable|script_unavailable|sdk_unavailable|sdk_not_ready|widget_unavailable|challenge_failed|challenge_timeout|challenge_expired|challenge_[0-9]{6})$/.test(error?.verificationCode||'')?error.verificationCode:'reception_unconfirmed';
      status(el, '送信前の確認または受付結果を確認できませんでした。入力内容は残っています。そのまま再度送信してください。お急ぎの場合は info@package-inc.com へご連絡ください。 確認コード：'+code, 'error');
    } finally {
      clearTimeout(timer);
      pending.inFlight = false;
      el.setAttribute('aria-busy', 'false');
    }
  }
  async function loadComments() {
    const form=document.querySelector('.s-blog-comment-form');
    if (!form) return;
    try {
      const page=document.querySelector('link[rel="canonical"]')?.href;
      const response=await fetch(endpoint+'?action=comments&format=json&page='+encodeURIComponent(page),{credentials:'omit',redirect:'follow'});
      if(!response.ok) return;
      const result=await response.json();if(!Array.isArray(result.comments)||!result.comments.length)return;
      const section=document.createElement('section');section.setAttribute('aria-label','新しいコメント');
      result.comments.forEach(c=>{const article=document.createElement('article');const name=document.createElement('strong');name.textContent=c.name;const text=document.createElement('p');text.textContent=c.text;text.style.whiteSpace='pre-wrap';article.append(name,text);section.append(article);});
      form.before(section);
    }catch(_){}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadComments,{once:true});else void loadComments();
  window.OecuhobogReceiver = Object.freeze({submitElement});
})();
