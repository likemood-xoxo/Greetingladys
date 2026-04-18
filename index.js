const MODULE_NAME = 'Greetingladys';

const DEFAULT_SETTINGS = Object.freeze({
    charDesc: '', greeting: '', userNote: '', korean: true, lastProfile: '',
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

const PANEL_HTML = `
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
    <div class="firstmsg-row-label">
      <label for="firstmsg-char-desc">📋 캐릭터 설명 / 퍼소나</label>
      <button id="firstmsg-autofill-btn" class="menu_button firstmsg-small-btn">자동 채우기</button>
    </div>
    <textarea id="firstmsg-char-desc" rows="5" placeholder="캐릭터의 성격, 특징, 배경을 입력하세요."></textarea>
  </div>

  <div class="firstmsg-section">
    <label for="firstmsg-greeting">💬 기존 그리팅 (참고용 — 완전히 다른 새 그리팅을 생성합니다)</label>
    <textarea id="firstmsg-greeting" rows="5" placeholder="기존 그리팅을 붙여넣으세요. 분위기·세계관·NPC만 참고하고 완전히 새로 씁니다."></textarea>
  </div>

  <div class="firstmsg-section">
    <label for="firstmsg-user-note">✏️ 추가 요청 사항 (선택)</label>
    <textarea id="firstmsg-user-note" rows="2" placeholder="예) 200자 내외로, 비 오는 날 밤, {{user}}가 처음 도착하는 장면"></textarea>
  </div>

  <div class="firstmsg-section firstmsg-options">
    <label class="firstmsg-checkbox-label">
      <input type="checkbox" id="firstmsg-korean" checked><span>한국어 출력</span>
    </label>
  </div>

  <div class="firstmsg-btn-row">
    <button id="firstmsg-generate-btn" class="menu_button firstmsg-main-btn">✨ 예시 5개 생성</button>
    <button id="firstmsg-clear-btn" class="menu_button">🗑️ 초기화</button>
  </div>

  <div id="firstmsg-loading" style="display:none;">
    <div class="firstmsg-spinner"></div><span id="firstmsg-loading-text">예시 생성 중...</span>
  </div>

  <!-- 예시 선택 영역 -->
  <div id="firstmsg-candidates-area" style="display:none;">
    <div class="firstmsg-candidates-header">
      <label>💡 마음에 드는 예시를 골라주세요</label>
      <button id="firstmsg-regen-btn" class="menu_button firstmsg-small-btn">🔄 다시 생성</button>
    </div>
    <div id="firstmsg-candidates-list"></div>
  </div>

  <!-- 최종 결과 -->
  <div id="firstmsg-result-area" style="display:none;">
    <div class="firstmsg-result-header">
      <label>✅ 생성된 퍼스트 메시지</label>
      <span id="firstmsg-char-count" class="firstmsg-char-count"></span>
    </div>
    <textarea id="firstmsg-result"></textarea>
    <div class="firstmsg-btn-row">
      <button id="firstmsg-copy-btn" class="menu_button">📋 복사하기</button>
      <button id="firstmsg-back-btn" class="menu_button">↩ 예시로 돌아가기</button>
    </div>
  </div>
</div>`;

function loadPanel() {
    if (document.getElementById('firstmsg-generate-btn')) return;
    const container = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!container) return;
    const wrapper = document.createElement('div');
    wrapper.classList.add('extension_block');
    wrapper.innerHTML = `<div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header">
        <b>✨ First Message Generator</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>
      <div class="inline-drawer-content">${PANEL_HTML}</div>
    </div>`;
    container.appendChild(wrapper);
    restoreInputs();
    refreshProfiles();
    bindEvents();
}

function restoreInputs() {
    const s = getSettings();
    setVal('firstmsg-char-desc', s.charDesc);
    setVal('firstmsg-greeting', s.greeting);
    setVal('firstmsg-user-note', s.userNote);
    setChecked('firstmsg-korean', s.korean);
}

// ── 커넥션 프로필 목록 가져오기 ───────────────────────────────
async function refreshProfiles() {
    const select = document.getElementById('firstmsg-profile-select');
    if (!select) return;
    while (select.options.length > 1) select.remove(1);

    try {
        // ST의 /api/connection-profiles 엔드포인트로 실제 목록 가져오기
        const resp = await fetch('/api/connection-profiles');
        if (resp.ok) {
            const profiles = await resp.json();
            for (const p of profiles) {
                const opt = document.createElement('option');
                opt.value = p.id ?? p.name ?? p;
                opt.textContent = p.name ?? p.id ?? String(p);
                select.appendChild(opt);
            }
        }
    } catch(e) {
        console.warn('[' + MODULE_NAME + '] 프로필 목록 가져오기 실패', e);
    }

    const saved = getSettings().lastProfile;
    if (saved) select.value = saved;
}

function bindEvents() {
    on('firstmsg-generate-btn',    'click', handleGenerateCandidates);
    on('firstmsg-regen-btn',       'click', handleGenerateCandidates);
    on('firstmsg-copy-btn',        'click', handleCopy);
    on('firstmsg-clear-btn',       'click', handleClear);
    on('firstmsg-autofill-btn',    'click', autoFill);
    on('firstmsg-profile-refresh', 'click', refreshProfiles);
    on('firstmsg-back-btn',        'click', () => {
        document.getElementById('firstmsg-result-area').style.display = 'none';
        document.getElementById('firstmsg-candidates-area').style.display = 'flex';
    });
    ['firstmsg-char-desc','firstmsg-greeting','firstmsg-user-note'].forEach(id =>
        document.getElementById(id)?.addEventListener('input', persistInputs));
    document.getElementById('firstmsg-korean')?.addEventListener('change', persistInputs);
    document.getElementById('firstmsg-profile-select')?.addEventListener('change', () => {
        getSettings().lastProfile = getVal('firstmsg-profile-select');
        SillyTavern.getContext().saveSettingsDebounced();
    });
    document.getElementById('firstmsg-result')?.addEventListener('input', updateCharCount);
}

function persistInputs() {
    const s = getSettings();
    s.charDesc = getVal('firstmsg-char-desc');
    s.greeting = getVal('firstmsg-greeting');
    s.userNote = getVal('firstmsg-user-note');
    s.korean   = getChecked('firstmsg-korean');
    SillyTavern.getContext().saveSettingsDebounced();
}

function autoFill() {
    const ctx = SillyTavern.getContext();
    const char = ctx.characters?.[ctx.characterId];
    if (!char) { toastr.warning('현재 선택된 캐릭터가 없습니다.'); return; }
    const parts = [];
    if (char.name)        parts.push('이름: ' + char.name);
    if (char.description) parts.push(char.description.trim());
    if (char.personality) parts.push('성격: ' + char.personality.trim());
    if (char.scenario)    parts.push('시나리오: ' + char.scenario.trim());
    setVal('firstmsg-char-desc', parts.join('\n\n'));
    if (char.first_mes) setVal('firstmsg-greeting', char.first_mes);
    persistInputs();
    toastr.success('"' + char.name + '" 캐릭터 정보를 불러왔습니다.');
}

// ── STEP 1: 예시 5개 생성 ──────────────────────────────────────
async function handleGenerateCandidates() {
    const charDesc = getVal('firstmsg-char-desc');
    const greeting = getVal('firstmsg-greeting');
    const userNote = getVal('firstmsg-user-note');
    const korean   = getChecked('firstmsg-korean');
    if (!charDesc.trim() && !greeting.trim()) {
        toastr.error('캐릭터 설명 또는 그리팅을 입력해주세요!');
        return;
    }

    await switchProfileIfNeeded();
    setLoading(true, '예시 5개 생성 중...');
    document.getElementById('firstmsg-candidates-area').style.display = 'none';
    document.getElementById('firstmsg-result-area').style.display = 'none';

    try {
        const langLine = korean ? '반드시 한국어로 작성하세요.' : 'Write in the same language as the provided info.';
        const systemPrompt = `당신은 롤플레이 채팅의 퍼스트 메시지를 전문으로 대필하는 작가입니다.

[중요 규칙]
- 기존 그리팅은 오직 참고용입니다. 절대 그대로 쓰거나 살짝만 바꾸지 마세요.
- 캐릭터의 말투, 성격, 세계관, NPC는 살리되, 완전히 새로운 장면과 상황으로 시작하세요.
- {{user}}, {{char}} 같은 변수는 그대로 유지하세요.
- ${langLine}

지금은 서로 다른 분위기와 시작 장면의 예시를 딱 5개만 작성합니다.
각 예시는 1~3문장의 짧은 요약(미리보기)으로 작성하세요.
반드시 아래 JSON 형식으로만 출력하세요. 다른 텍스트 없이.

{"candidates":["예시1 내용","예시2 내용","예시3 내용","예시4 내용","예시5 내용"]}`;

        let userPrompt = '';
        if (charDesc.trim()) userPrompt += '[캐릭터 정보]\n' + charDesc.trim() + '\n\n';
        if (greeting.trim()) userPrompt += '[기존 그리팅 — 참고만 할 것, 그대로 쓰지 말 것]\n' + greeting.trim() + '\n\n';
        if (userNote.trim()) userPrompt += '[추가 요청]\n' + userNote.trim() + '\n\n';
        userPrompt += '위 정보를 바탕으로 완전히 새로운 퍼스트 메시지 예시 5개를 JSON으로 출력하세요.';

        const raw = await SillyTavern.getContext().generateRaw({ systemPrompt, prompt: userPrompt });
        const jsonStr = raw.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(jsonStr);
        const candidates = parsed.candidates ?? parsed;

        renderCandidates(candidates);
        toastr.success('예시 5개 생성 완료! 마음에 드는 걸 골라주세요.');
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

// ── STEP 2: 선택한 예시를 풀버전으로 확장 ──────────────────────
async function handleSelectCandidate(candidateText, idx) {
    const charDesc = getVal('firstmsg-char-desc');
    const greeting = getVal('firstmsg-greeting');
    const userNote = getVal('firstmsg-user-note');
    const korean   = getChecked('firstmsg-korean');

    // 선택된 카드 하이라이트
    document.querySelectorAll('.firstmsg-candidate-card').forEach((c, i) => {
        c.classList.toggle('firstmsg-candidate-selected', i === idx);
    });

    await switchProfileIfNeeded();
    setLoading(true, '선택한 예시를 풀버전으로 작성 중...');
    document.getElementById('firstmsg-result-area').style.display = 'none';

    try {
        const langLine = korean ? '반드시 한국어로 작성하세요.' : 'Write in the same language as the provided info.';
        const systemPrompt = `당신은 롤플레이 채팅의 퍼스트 메시지를 전문으로 대필하는 작가입니다.

[규칙]
- 캐릭터의 말투, 성격, 세계관을 정확히 반영하세요.
- 기존 그리팅은 참고용입니다. 그대로 쓰지 말고 완전히 새로 작성하세요.
- 행동 묘사는 *이탤릭체*로, 대사는 자연스럽게 포함하세요.
- {{user}}, {{char}} 변수는 그대로 유지하세요.
- ${langLine}
- 퍼스트 메시지 본문만 출력하세요. 제목이나 설명 없이.`;

        let userPrompt = '';
        if (charDesc.trim()) userPrompt += '[캐릭터 정보]\n' + charDesc.trim() + '\n\n';
        if (greeting.trim()) userPrompt += '[기존 그리팅 — 참고만 할 것]\n' + greeting.trim() + '\n\n';
        if (userNote.trim()) userPrompt += '[추가 요청]\n' + userNote.trim() + '\n\n';
        userPrompt += '[선택한 예시 — 이 내용을 바탕으로 풀버전으로 확장해주세요]\n' + candidateText + '\n\n퍼스트 메시지를 작성해주세요.';

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

async function switchProfileIfNeeded() {
    const profileId = getVal('firstmsg-profile-select');
    if (!profileId) return;
    try {
        await fetch('/api/connection-profiles/activate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: profileId }),
        });
    } catch(e) {}
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
    ['firstmsg-char-desc','firstmsg-greeting','firstmsg-user-note','firstmsg-result'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('firstmsg-candidates-area').style.display = 'none';
    document.getElementById('firstmsg-result-area').style.display = 'none';
    persistInputs();
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
    eventSource.on(event_types.APP_READY, () => loadPanel());
});
