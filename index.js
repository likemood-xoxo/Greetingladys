const MODULE_NAME = 'Greetingladys';

const DEFAULT_SETTINGS = Object.freeze({
    charDesc: '', greeting: '', userNote: '',
    useActions: true, useDialogue: true, korean: true, lastProfile: '',
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
      <button id="firstmsg-profile-refresh" class="menu_button">↻</button>
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
    <label for="firstmsg-greeting">💬 그리팅 / 시나리오 (참고용)</label>
    <textarea id="firstmsg-greeting" rows="5" placeholder="기존 그리팅이나 시나리오를 붙여넣으세요."></textarea>
  </div>
  <div class="firstmsg-section">
    <label for="firstmsg-user-note">✏️ 추가 요청 사항 (선택)</label>
    <textarea id="firstmsg-user-note" rows="2" placeholder="예) 200자 내외로, 불안한 분위기로"></textarea>
  </div>
  <div class="firstmsg-section firstmsg-options">
    <label class="firstmsg-checkbox-label"><input type="checkbox" id="firstmsg-use-actions" checked><span>행동 묘사 (*이탤릭*)</span></label>
    <label class="firstmsg-checkbox-label"><input type="checkbox" id="firstmsg-use-dialogue" checked><span>대사 포함</span></label>
    <label class="firstmsg-checkbox-label"><input type="checkbox" id="firstmsg-korean" checked><span>한국어 출력</span></label>
  </div>
  <div class="firstmsg-btn-row">
    <button id="firstmsg-generate-btn" class="menu_button firstmsg-main-btn">✨ 퍼스트 메시지 생성</button>
    <button id="firstmsg-clear-btn" class="menu_button">🗑️ 초기화</button>
  </div>
  <div id="firstmsg-loading" style="display:none;">
    <div class="firstmsg-spinner"></div><span>생성 중...</span>
  </div>
  <div id="firstmsg-result-area" style="display:none;">
    <div class="firstmsg-result-header">
      <label>✅ 생성된 퍼스트 메시지</label>
      <span id="firstmsg-char-count" class="firstmsg-char-count"></span>
    </div>
    <textarea id="firstmsg-result"></textarea>
    <div class="firstmsg-btn-row">
      <button id="firstmsg-copy-btn" class="menu_button">📋 복사하기</button>
      <button id="firstmsg-regen-btn" class="menu_button">🔄 다시 생성</button>
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
    setChecked('firstmsg-use-actions', s.useActions);
    setChecked('firstmsg-use-dialogue', s.useDialogue);
    setChecked('firstmsg-korean', s.korean);
}

function refreshProfiles() {
    const select = document.getElementById('firstmsg-profile-select');
    if (!select) return;
    const profiles = SillyTavern.getContext().connection_profiles ?? [];
    while (select.options.length > 1) select.remove(1);
    for (const p of profiles) {
        const opt = document.createElement('option');
        opt.value = p.id ?? p.name ?? p;
        opt.textContent = p.name ?? p.id ?? p;
        select.appendChild(opt);
    }
    const saved = getSettings().lastProfile;
    if (saved) select.value = saved;
}

function bindEvents() {
    on('firstmsg-generate-btn', 'click', handleGenerate);
    on('firstmsg-regen-btn', 'click', handleGenerate);
    on('firstmsg-copy-btn', 'click', handleCopy);
    on('firstmsg-clear-btn', 'click', handleClear);
    on('firstmsg-autofill-btn', 'click', autoFill);
    on('firstmsg-profile-refresh', 'click', refreshProfiles);
    ['firstmsg-char-desc','firstmsg-greeting','firstmsg-user-note'].forEach(id =>
        document.getElementById(id)?.addEventListener('input', persistInputs));
    ['firstmsg-use-actions','firstmsg-use-dialogue','firstmsg-korean'].forEach(id =>
        document.getElementById(id)?.addEventListener('change', persistInputs));
    document.getElementById('firstmsg-result')?.addEventListener('input', updateCharCount);
    document.getElementById('firstmsg-profile-select')?.addEventListener('change', () => {
        getSettings().lastProfile = getVal('firstmsg-profile-select');
        SillyTavern.getContext().saveSettingsDebounced();
    });
}

function persistInputs() {
    const s = getSettings();
    s.charDesc = getVal('firstmsg-char-desc');
    s.greeting = getVal('firstmsg-greeting');
    s.userNote = getVal('firstmsg-user-note');
    s.useActions = getChecked('firstmsg-use-actions');
    s.useDialogue = getChecked('firstmsg-use-dialogue');
    s.korean = getChecked('firstmsg-korean');
    SillyTavern.getContext().saveSettingsDebounced();
}

function autoFill() {
    const ctx = SillyTavern.getContext();
    const char = ctx.characters?.[ctx.characterId];
    if (!char) { toastr.warning('현재 선택된 캐릭터가 없습니다.'); return; }
    const parts = [];
    if (char.name) parts.push('이름: ' + char.name);
    if (char.description) parts.push(char.description.trim());
    if (char.personality) parts.push('성격: ' + char.personality.trim());
    if (char.scenario) parts.push('시나리오: ' + char.scenario.trim());
    setVal('firstmsg-char-desc', parts.join('\n\n'));
    if (char.first_mes) setVal('firstmsg-greeting', char.first_mes);
    persistInputs();
    toastr.success('"' + char.name + '" 캐릭터 정보를 불러왔습니다.');
}

async function handleGenerate() {
    const charDesc = getVal('firstmsg-char-desc');
    const greeting = getVal('firstmsg-greeting');
    const userNote = getVal('firstmsg-user-note');
    const useActions = getChecked('firstmsg-use-actions');
    const useDialogue = getChecked('firstmsg-use-dialogue');
    const korean = getChecked('firstmsg-korean');
    if (!charDesc.trim() && !greeting.trim()) { toastr.error('캐릭터 설명 또는 그리팅을 입력해주세요!'); return; }
    const profileId = getVal('firstmsg-profile-select');
    if (profileId) {
        try {
            await fetch('/api/connection-profiles/activate', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: profileId }),
            });
        } catch(e) {}
    }
    setLoading(true);
    try {
        const langLine = korean ? '반드시 한국어로 작성하세요.' : 'Write in the same language as the provided info.';
        const fmt = [];
        if (useActions) fmt.push('행동 묘사는 *이탤릭체*로 감싸주세요.');
        if (useDialogue) fmt.push('캐릭터의 말을 자연스럽게 포함해주세요.');
        if (!useActions && !useDialogue) fmt.push('서술형으로만 작성해주세요.');
        const systemPrompt = '당신은 롤플레이 채팅의 퍼스트 메시지를 전문으로 대필하는 작가입니다.\n캐릭터의 말투, 성격, 그리팅 속 NPC와 세계관을 정확히 반영해주세요.\n{{user}}, {{char}} 같은 변수는 그대로 유지하세요.\n' + fmt.map(l => '- ' + l).join('\n') + '\n- ' + langLine + '\n퍼스트 메시지 본문만 출력하세요. 제목이나 설명 없이.';
        let userPrompt = '';
        if (charDesc.trim()) userPrompt += '[캐릭터 정보]\n' + charDesc.trim() + '\n\n';
        if (greeting.trim()) userPrompt += '[그리팅 / 참고 씬]\n' + greeting.trim() + '\n\n';
        if (userNote.trim()) userPrompt += '[추가 요청]\n' + userNote.trim() + '\n\n';
        userPrompt += '위 정보를 바탕으로 퍼스트 메시지를 작성해주세요.';
        const result = await SillyTavern.getContext().generateRaw({ systemPrompt, prompt: userPrompt });
        if (!result?.trim()) { toastr.error('생성 결과가 비어있습니다.'); return; }
        document.getElementById('firstmsg-result').value = result.trim();
        document.getElementById('firstmsg-result-area').style.display = 'flex';
        updateCharCount();
        document.getElementById('firstmsg-result-area').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        toastr.success('퍼스트 메시지 생성 완료!');
    } catch(err) {
        console.error('[' + MODULE_NAME + ']', err);
        toastr.error('오류: ' + (err.message ?? err));
    } finally {
        setLoading(false);
    }
}

function setLoading(on) {
    document.getElementById('firstmsg-loading').style.display = on ? 'flex' : 'none';
    document.getElementById('firstmsg-generate-btn').disabled = on;
    document.getElementById('firstmsg-regen-btn').disabled = on;
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
    document.getElementById('firstmsg-result-area').style.display = 'none';
    persistInputs();
    toastr.info('초기화되었습니다.');
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
