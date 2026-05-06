const MODULE_NAME = 'Greetingladys';

const DEFAULT_SETTINGS = Object.freeze({
    userNote: '', korean: true, lastProfile: '',
});

function getSettings() {
    const { extensionSettings } = SillyTavern.getContext();
    if (!extensionSettings[MODULE_NAME])
        extensionSettings[MODULE_NAME] = structuredClone(DEFAULT_SETTINGS);
    for (const k of Object.keys(DEFAULT_SETTINGS))
        if (!Object.hasOwn(extensionSettings[MODULE_NAME], k))
            extensionSettings[MODULE_NAME][k] = DEFAULT_SETTINGS[k];
    return extensionSettings[MODULE_NAME];
}

// ── 팝업 HTML ────────────────────────────────────────────────
const POPUP_HTML = `
<div id="firstmsg-popup-overlay" class="firstmsg-popup-overlay" style="display:none;">
  <div class="firstmsg-popup-box">
    <div class="firstmsg-popup-header">
      <span>✨ GreetingLadys</span>
      <button id="firstmsg-popup-close" class="firstmsg-popup-close-btn" title="닫기">✕</button>
    </div>
    <div class="firstmsg-panel">
      <div class="firstmsg-section">
        <div class="firstmsg-row-label">
          <label>🔌 커넥션 프로필</label>
          <span class="firstmsg-hint">비워두면 현재 연결된 API 사용</span>
        </div>
        <div class="firstmsg-profile-row">
          <select id="firstmsg-profile-select"><option value="">(현재 연결된 API 사용)</option></select>
          <button id="firstmsg-profile-refresh" class="menu_button" title="새로고침">↻</button>
        </div>
      </div>
      <div class="firstmsg-section">
        <label for="firstmsg-user-note">✏️ 원하는 분위기 / 추가 요청 (선택)</label>
        <textarea id="firstmsg-user-note" rows="3" placeholder="예) 완전 롤콤, 슬로우번 느낌의 친한 친구 그리팅&#10;비워두면 캐릭터 기반으로 랜덤 생성"></textarea>
      </div>
      <div class="firstmsg-section firstmsg-options">
        <label class="firstmsg-checkbox-label">
          <input type="checkbox" id="firstmsg-korean"><span>한국어 출력</span>
        </label>
      </div>
      <div class="firstmsg-btn-row">
        <button id="firstmsg-generate-btn" class="menu_button firstmsg-main-btn">✨ 예시 5개 생성</button>
        <button id="firstmsg-clear-btn" class="menu_button">🗑️ 초기화</button>
      </div>
      <div id="firstmsg-loading" style="display:none;">
        <div class="firstmsg-spinner"></div>
        <span id="firstmsg-loading-text">예시 생성 중...</span>
      </div>
      <div id="firstmsg-candidates-area" style="display:none;">
        <div class="firstmsg-candidates-header">
          <label>💡 마음에 드는 씬을 골라주세요</label>
          <button id="firstmsg-regen-btn" class="menu_button firstmsg-small-btn">🔄 다시 생성</button>
        </div>
        <div id="firstmsg-candidates-list"></div>
      </div>
      <div id="firstmsg-result-area" style="display:none;">
        <div class="firstmsg-result-header">
          <label>✅ 생성된 퍼스트 메시지</label>
          <span id="firstmsg-char-count" class="firstmsg-char-count"></span>
        </div>
        <textarea id="firstmsg-result"></textarea>
        <div class="firstmsg-btn-row">
          <button id="firstmsg-apply-btn" class="menu_button firstmsg-apply-btn">✅ 그리팅에 추가하기</button>
          <button id="firstmsg-copy-btn" class="menu_button">📋 복사하기</button>
          <button id="firstmsg-back-btn" class="menu_button">↩ 씬 목록으로</button>
        </div>
      </div>
    </div>
  </div>
</div>`;

// ── 팝업 초기화 ──────────────────────────────────────────────
function initPopup() {
    if (document.getElementById('firstmsg-popup-overlay')) return;
    document.body.insertAdjacentHTML('beforeend', POPUP_HTML);
    setChecked('firstmsg-korean', getSettings().korean);
    bindPopupEvents();
}

function openPopup() {
    initPopup();
    setVal('firstmsg-user-note', '');
    setVal('firstmsg-result', '');
    setChecked('firstmsg-korean', false);
    const charCount = document.getElementById('firstmsg-char-count');
    if (charCount) charCount.textContent = '';
    const list = document.getElementById('firstmsg-candidates-list');
    if (list) list.innerHTML = '';
    document.getElementById('firstmsg-candidates-area').style.display = 'none';
    document.getElementById('firstmsg-result-area').style.display = 'none';
    document.getElementById('firstmsg-loading').style.display = 'none';
    refreshProfiles();
    document.getElementById('firstmsg-popup-overlay').style.display = 'flex';
}

function closePopup() {
    const overlay = document.getElementById('firstmsg-popup-overlay');
    if (overlay) overlay.style.display = 'none';
}

// ── ✒️ 버튼 주입 ─────────────────────────────────────────────
function injectPencilButton() {
    if (document.getElementById('firstmsg-pencil-btn')) return;

    const altBtn =
        document.querySelector('#set_first_mes') ??
        [...document.querySelectorAll('button, .menu_button, [title]')]
            .find(el =>
                el.textContent?.trim() === '대체. 첫 메시지' ||
                el.title === '대체. 첫 메시지' ||
                el.id?.includes('alt') ||
                el.id?.includes('first_mes')
            );

    if (!altBtn) return;

    const pencilBtn = document.createElement('button');
    pencilBtn.id = 'firstmsg-pencil-btn';
    pencilBtn.className = 'menu_button firstmsg-pencil-btn';
    pencilBtn.title = 'GreetingLadys — AI 그리팅 생성';
    pencilBtn.textContent = '✒️';
    pencilBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openPopup();
    });

    altBtn.insertAdjacentElement('afterend', pencilBtn);
}

// ── 프로필 목록 로드 ─────────────────────────────────────────
function refreshProfiles() {
    const mySelect = document.getElementById('firstmsg-profile-select');
    if (!mySelect) return;

    while (mySelect.options.length > 1) mySelect.remove(1);

    const ctx = SillyTavern.getContext();

    // ST가 프로필을 저장하는 실제 경로
    const profiles =
        ctx.extensionSettings?.connectionManager?.profiles ??
        ctx.extensionSettings?.['connection-manager']?.profiles ??
        null;

    if (Array.isArray(profiles) && profiles.length > 0) {
        const saved = getSettings().lastProfile;
        for (const p of profiles) {
            const opt = document.createElement('option');
            opt.value = p.id ?? p.name ?? String(p);
            opt.textContent = p.name ?? p.id ?? String(p);
            mySelect.appendChild(opt);
        }
        if (saved) mySelect.value = saved;
        console.log('[GreetingLadys] 프로필 로드 완료:', mySelect.options.length - 1, '개');
    } else {
        console.log('[GreetingLadys] 프로필 없음 — 현재 API 사용');
    }
}

function bindPopupEvents() {
    on('firstmsg-popup-close',     'click', closePopup);
    on('firstmsg-generate-btn',    'click', handleGenerateCandidates);
    on('firstmsg-regen-btn',       'click', handleGenerateCandidates);
    on('firstmsg-copy-btn',        'click', handleCopy);
    on('firstmsg-clear-btn',       'click', handleClear);
    on('firstmsg-apply-btn',       'click', handleApplyGreeting);
    on('firstmsg-profile-refresh', 'click', refreshProfiles);
    on('firstmsg-back-btn', 'click', () => {
        document.getElementById('firstmsg-result-area').style.display = 'none';
        document.getElementById('firstmsg-candidates-area').style.display = 'flex';
    });
    document.getElementById('firstmsg-korean')?.addEventListener('change', () => {
        getSettings().korean = getChecked('firstmsg-korean');
        SillyTavern.getContext().saveSettingsDebounced();
    });
    document.getElementById('firstmsg-profile-select')?.addEventListener('change', () => {
        getSettings().lastProfile = getVal('firstmsg-profile-select');
        SillyTavern.getContext().saveSettingsDebounced();
    });
    document.getElementById('firstmsg-result')?.addEventListener('input', updateCharCount);
    document.getElementById('firstmsg-popup-overlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'firstmsg-popup-overlay') closePopup();
    });
}

// ── 프로필 전환 ──────────────────────────────────────────────
async function switchProfileIfNeeded() {
    const profileId = getVal('firstmsg-profile-select');
    if (!profileId) return;

    // ST의 연결 프로필 드롭다운을 찾아서 변경 + change 이벤트 발생
    // ST는 connection-manager 확장의 select로 프로필을 전환함
    const stProfileSelects = [
        ...document.querySelectorAll('select')
    ].filter(sel => {
        const opts = [...sel.options];
        return opts.some(o => o.value === profileId);
    });

    for (const sel of stProfileSelects) {
        if (sel.id === 'firstmsg-profile-select') continue;
        sel.value = profileId;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 400));
        console.log('[GreetingLadys] 프로필 전환:', profileId, '→ select#' + sel.id);
        return;
    }

    // fallback: REST API
    try {
        await fetch('/api/connection-profiles/activate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: profileId }),
        });
    } catch(e) {}
}

// ── STEP 1: 씬 예시 5개 생성 ─────────────────────────────────
async function handleGenerateCandidates() {
    const charInfo = getCurrentCharInfo();
    if (!charInfo?.desc?.trim()) { toastr.error('캐릭터를 먼저 선택해주세요!'); return; }
    const userNote = getVal('firstmsg-user-note');
    const korean   = getChecked('firstmsg-korean');

    await switchProfileIfNeeded();
    setLoading(true, '예시 5개 생성 중...');
    document.getElementById('firstmsg-candidates-area').style.display = 'none';
    document.getElementById('firstmsg-result-area').style.display = 'none';

    try {
        const langLine = korean ? '반드시 한국어로 작성하세요.' : 'Write in the same language as the character info.';
        const systemPrompt = `당신은 롤플레이 채팅의 퍼스트 메시지 씬 아이디어를 제안하는 작가입니다.

[규칙]
- 기존 그리팅은 참고용입니다. 절대 그대로 쓰거나 살짝만 바꾸지 마세요. 완전히 새로운 씬을 제안하세요.
- 캐릭터의 성격과 특성이 자연스럽게 드러나는 씬이어야 합니다.
- 각 예시는 반드시 한 문장으로만 씁니다. 실제 대사나 긴 묘사 절대 금지.
- 어떤 장면인지 핵심 상황만 짧고 재미있게 설명하세요.
- ${langLine}

반드시 아래 JSON 형식으로만 출력하세요. 다른 텍스트 없이:
{"candidates":["씬 설명 1","씬 설명 2","씬 설명 3","씬 설명 4","씬 설명 5"]}`;

        let userPrompt = '[캐릭터 정보]\n' + charInfo.desc + '\n\n';
        if (charInfo.firstName) userPrompt += '[기존 그리팅 — 참고만 할 것]\n' + charInfo.firstName + '\n\n';
        if (userNote.trim())    userPrompt += '[원하는 분위기 / 추가 요청]\n' + userNote.trim() + '\n\n';
        userPrompt += '완전히 새로운 씬 아이디어 5개를 JSON으로 출력하세요.';

        const raw = await SillyTavern.getContext().generateRaw({ systemPrompt, prompt: userPrompt });
        const jsonStr = raw.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(jsonStr);
        renderCandidates(parsed.candidates ?? parsed);
        toastr.success('씬 아이디어 5개 생성 완료!');
    } catch(err) {
        console.error('[' + MODULE_NAME + ']', err);
        toastr.error('오류: ' + (err.message ?? err));
    } finally {
        setLoading(false);
    }
}

function renderCandidates(candidates) {
    const list = document.getElementById('firstmsg-candidates-list');
    list.innerHTML = '';
    candidates.forEach((text, i) => {
        const card = document.createElement('div');
        card.className = 'firstmsg-candidate-card';
        card.innerHTML = `<span class="firstmsg-candidate-num">${i + 1}</span><span class="firstmsg-candidate-text">${escHtml(text)}</span>`;
        card.addEventListener('click', () => handleSelectCandidate(text, i));
        list.appendChild(card);
    });
    document.getElementById('firstmsg-candidates-area').style.display = 'flex';
    document.getElementById('firstmsg-candidates-area').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── STEP 2: 씬 → 풀버전 ──────────────────────────────────────
async function handleSelectCandidate(candidateText, idx) {
    const charInfo = getCurrentCharInfo();
    const userNote = getVal('firstmsg-user-note');
    const korean   = getChecked('firstmsg-korean');

    document.querySelectorAll('.firstmsg-candidate-card').forEach((c, i) =>
        c.classList.toggle('firstmsg-candidate-selected', i === idx));

    await switchProfileIfNeeded();
    setLoading(true, '풀버전 작성 중...');
    document.getElementById('firstmsg-result-area').style.display = 'none';

    try {
        const langLine = korean ? '반드시 한국어로 작성하세요.' : 'Write in the same language as the character info.';
        const systemPrompt = `당신은 롤플레이 채팅의 퍼스트 메시지를 전문으로 대필하는 작가입니다.

[서술 규칙 — 반드시 준수]
- 나레이션(배경 묘사, 행동 묘사)은 이탤릭 없이 일반 텍스트로 씁니다.
- *이탤릭*은 오직 캐릭터의 내면 생각이나 독백에만 사용합니다.
- 캐릭터 대사는 따옴표로 표시합니다.
- 절대 모든 나레이션에 *이탤릭*을 남발하지 마세요.

[예시 형식]
방 안에 빗소리가 조용히 깔린다. 아틀라스가 젖은 머리를 털며 문을 열고 들어온다.
*왜 이렇게 신경 쓰이지.*
"야, 타월 좀 줘봐."

[내용 규칙]
- 기존 그리팅은 참고용입니다. 완전히 새로운 장면으로 작성하세요.
- 캐릭터의 말투, 성격, 특성을 정확히 반영하세요.
- {{user}}, {{char}} 변수는 그대로 유지하세요.
- ${langLine}
- 퍼스트 메시지 본문만 출력하세요. 제목이나 설명 없이.`;

        let userPrompt = '[캐릭터 정보]\n' + charInfo.desc + '\n\n';
        if (charInfo.firstName) userPrompt += '[기존 그리팅 — 참고만 할 것]\n' + charInfo.firstName + '\n\n';
        if (userNote.trim())    userPrompt += '[원하는 분위기]\n' + userNote.trim() + '\n\n';
        userPrompt += '[선택한 씬 아이디어]\n' + candidateText + '\n\n이 씬을 풀버전 퍼스트 메시지로 작성해주세요.';

        const result = await SillyTavern.getContext().generateRaw({ systemPrompt, prompt: userPrompt });
        if (!result?.trim()) { toastr.error('생성 결과가 비어있습니다.'); return; }

        setVal('firstmsg-result', result.trim());
        document.getElementById('firstmsg-result-area').style.display = 'flex';
        updateCharCount();
        document.getElementById('firstmsg-result-area').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        toastr.success('완성!');
    } catch(err) {
        console.error('[' + MODULE_NAME + ']', err);
        toastr.error('오류: ' + (err.message ?? err));
    } finally {
        setLoading(false);
    }
}

// ── 그리팅에 추가 ─────────────────────────────────────────────
async function handleApplyGreeting() {
    const text = document.getElementById('firstmsg-result')?.value?.trim();
    if (!text) return;
    const ctx = SillyTavern.getContext();
    const char = ctx.characters?.[ctx.characterId];
    if (!char) { toastr.error('캐릭터를 선택해주세요.'); return; }
    try {
        if (!Array.isArray(char.data?.alternate_greetings)) {
            if (!char.data) char.data = {};
            char.data.alternate_greetings = [];
        }
        char.data.alternate_greetings.push(text);
        const formData = new FormData();
        formData.append('avatar_url', char.avatar);
        formData.append('ch_name', char.name);
        formData.append('description', char.description ?? '');
        formData.append('personality', char.personality ?? '');
        formData.append('scenario', char.scenario ?? '');
        formData.append('first_mes', char.first_mes ?? '');
        formData.append('mes_example', char.mes_example ?? '');
        formData.append('world', char.world ?? '');
        formData.append('json_data', JSON.stringify(char.data));
        formData.append('overwrite_action', 'true');
        const res = await fetch('/api/characters/edit', { method: 'POST', body: formData });
        if (!res.ok) throw new Error('저장 실패: ' + res.status);
        ctx.eventSource.emit(ctx.event_types.CHARACTER_EDITED, { detail: { id: ctx.characterId } });
        toastr.success('그리팅에 추가되었습니다!');
        closePopup();
    } catch(err) {
        console.error('[' + MODULE_NAME + ']', err);
        toastr.error('추가 실패: ' + (err.message ?? err));
    }
}

function getCurrentCharInfo() {
    const ctx = SillyTavern.getContext();
    const char = ctx.characters?.[ctx.characterId];
    if (!char) return null;
    const parts = [];
    if (char.name)        parts.push('이름: ' + char.name);
    if (char.description) parts.push(char.description.trim());
    if (char.personality) parts.push('성격: ' + char.personality.trim());
    if (char.scenario)    parts.push('시나리오: ' + char.scenario.trim());
    // 페르소나 이름은 항상 {{user}}로 고정
    parts.push('유저(상대방) 이름: {{user}}');
    return { desc: parts.join('\n\n'), firstName: char.first_mes ?? '', name: char.name ?? '' };
}

function setLoading(on, msg) {
    document.getElementById('firstmsg-loading').style.display = on ? 'flex' : 'none';
    if (msg) document.getElementById('firstmsg-loading-text').textContent = msg;
    document.getElementById('firstmsg-generate-btn').disabled = on;
    const regen = document.getElementById('firstmsg-regen-btn');
    if (regen) regen.disabled = on;
}
function updateCharCount() {
    const r = document.getElementById('firstmsg-result');
    document.getElementById('firstmsg-char-count').textContent = r.value.length + '자';
}
async function handleCopy() {
    const v = document.getElementById('firstmsg-result')?.value;
    if (!v) return;
    await navigator.clipboard.writeText(v);
    toastr.success('클립보드에 복사했습니다!');
}
function handleClear() {
    setVal('firstmsg-user-note', '');
    setVal('firstmsg-result', '');
    const list = document.getElementById('firstmsg-candidates-list');
    if (list) list.innerHTML = '';
    document.getElementById('firstmsg-candidates-area').style.display = 'none';
    document.getElementById('firstmsg-result-area').style.display = 'none';
    toastr.info('초기화되었습니다.');
}
function escHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function on(id, ev, fn) { document.getElementById(id)?.addEventListener(ev, fn); }
function getVal(id) { return document.getElementById(id)?.value ?? ''; }
function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v ?? ''; }
function getChecked(id) { return document.getElementById(id)?.checked ?? false; }
function setChecked(id, v) { const el = document.getElementById(id); if (el) el.checked = !!v; }

jQuery(async () => {
    const { eventSource, event_types } = SillyTavern.getContext();
    eventSource.on(event_types.APP_READY, () => {
        injectPencilButton();
        const observer = new MutationObserver(() => {
            if (!document.getElementById('firstmsg-pencil-btn')) injectPencilButton();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    });
    eventSource.on(event_types.CHARACTER_SELECTED, () => {
        setTimeout(injectPencilButton, 300);
    });
});
