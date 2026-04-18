// ============================================================
//  First Message Generator — SillyTavern Extension
//  캐릭터 설명 + 그리팅 → 퍼스트 메시지 AI 대필
//  ST 내장 generateRaw() 사용 (API 키 노출 없음)
// ============================================================

const MODULE_NAME = 'st-firstmsg-generator';

// ── 기본 설정 ─────────────────────────────────────────────────
const DEFAULT_SETTINGS = Object.freeze({
    charDesc:    '',
    greeting:    '',
    userNote:    '',
    useActions:  true,
    useDialogue: true,
    korean:      true,
    lastProfile: '',
});

// ── 설정 로드/저장 ────────────────────────────────────────────
function getSettings() {
    const { extensionSettings } = SillyTavern.getContext();
    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = structuredClone(DEFAULT_SETTINGS);
    }
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (!Object.hasOwn(extensionSettings[MODULE_NAME], key)) {
            extensionSettings[MODULE_NAME][key] = DEFAULT_SETTINGS[key];
        }
    }
    return extensionSettings[MODULE_NAME];
}

function saveSettings() {
    const { saveSettingsDebounced } = SillyTavern.getContext();
    saveSettingsDebounced();
}

// ── 패널 마운트 ───────────────────────────────────────────────
async function loadPanel() {
    // settings.html을 직접 fetch (renderExtensionTemplateAsync 폴백)
    let html = '';
    try {
        const { renderExtensionTemplateAsync } = SillyTavern.getContext();
        html = await renderExtensionTemplateAsync(
            `third-party/${MODULE_NAME}`,
            'settings',
            {}
        );
    } catch (_) {}

    // renderExtensionTemplateAsync 실패 시 직접 fetch
    if (!html || html === 'undefined' || html.trim() === '') {
        try {
            const resp = await fetch(`/scripts/extensions/third-party/${MODULE_NAME}/settings.html`);
            html = await resp.text();
        } catch (err) {
            console.error(`[${MODULE_NAME}] settings.html 로드 실패:`, err);
            html = '<p style="color:red">First Message Generator: settings.html 로드 실패</p>';
        }
    }

    // extensions_settings2가 없으면 extensions_settings 사용
    const container = document.getElementById('extensions_settings2') 
                   || document.getElementById('extensions_settings');
    if (!container) return;

    const wrapper = document.createElement('div');
    wrapper.classList.add('extension_block');
    wrapper.innerHTML = `
      <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
          <b>✨ First Message Generator</b>
          <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
          ${html}
        </div>
      </div>`;
    container.appendChild(wrapper);

    restoreInputs();
    await refreshProfiles();
    bindEvents();
}

// ── 저장된 값 복원 ────────────────────────────────────────────
function restoreInputs() {
    const s = getSettings();
    setVal('firstmsg-char-desc',    s.charDesc);
    setVal('firstmsg-greeting',     s.greeting);
    setVal('firstmsg-user-note',    s.userNote);
    setChecked('firstmsg-use-actions',  s.useActions);
    setChecked('firstmsg-use-dialogue', s.useDialogue);
    setChecked('firstmsg-korean',       s.korean);
}

// ── Connection Profile 목록 가져오기 ─────────────────────────
async function refreshProfiles() {
    const select = document.getElementById('firstmsg-profile-select');
    if (!select) return;

    // ST context에서 connection_profiles 가져오기
    const ctx = SillyTavern.getContext();
    const profiles = ctx.connection_profiles ?? ctx.connectionProfiles ?? [];

    // 기존 옵션 초기화 (첫 번째 "(현재 연결)" 옵션은 유지)
    while (select.options.length > 1) select.remove(1);

    if (profiles.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '(저장된 프로필 없음)';
        opt.disabled = true;
        select.appendChild(opt);
        return;
    }

    for (const profile of profiles) {
        const opt = document.createElement('option');
        // 프로필 구조: { id, name, ... } 또는 단순 string
        opt.value = profile.id ?? profile.name ?? profile;
        opt.textContent = profile.name ?? profile.id ?? profile;
        select.appendChild(opt);
    }

    // 마지막으로 사용한 프로필 복원
    const saved = getSettings().lastProfile;
    if (saved) select.value = saved;
}

// ── 이벤트 바인딩 ─────────────────────────────────────────────
function bindEvents() {
    // 생성 버튼들
    on('firstmsg-generate-btn', 'click', handleGenerate);
    on('firstmsg-regen-btn',    'click', handleGenerate);
    on('firstmsg-copy-btn',     'click', handleCopy);
    on('firstmsg-clear-btn',    'click', handleClear);
    on('firstmsg-autofill-btn', 'click', autoFill);
    on('firstmsg-profile-refresh', 'click', refreshProfiles);

    // 입력값 자동 저장
    for (const id of ['firstmsg-char-desc', 'firstmsg-greeting', 'firstmsg-user-note']) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', persistInputs);
    }
    for (const id of ['firstmsg-use-actions', 'firstmsg-use-dialogue', 'firstmsg-korean']) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', persistInputs);
    }

    // 결과 직접 편집 허용
    const resultEl = document.getElementById('firstmsg-result');
    if (resultEl) {
        resultEl.removeAttribute('readonly');
        resultEl.addEventListener('input', updateCharCount);
    }

    // 프로필 선택 저장
    const profileSel = document.getElementById('firstmsg-profile-select');
    if (profileSel) {
        profileSel.addEventListener('change', () => {
            getSettings().lastProfile = profileSel.value;
            saveSettings();
        });
    }
}

// 입력값 → 설정에 저장
function persistInputs() {
    const s = getSettings();
    s.charDesc    = getVal('firstmsg-char-desc');
    s.greeting    = getVal('firstmsg-greeting');
    s.userNote    = getVal('firstmsg-user-note');
    s.useActions  = getChecked('firstmsg-use-actions');
    s.useDialogue = getChecked('firstmsg-use-dialogue');
    s.korean      = getChecked('firstmsg-korean');
    saveSettings();
}

// ── 현재 캐릭터 자동 채우기 ───────────────────────────────────
function autoFill() {
    const ctx = SillyTavern.getContext();
    const char = ctx.characters?.[ctx.characterId];

    if (!char) {
        toastr.warning('현재 선택된 캐릭터가 없습니다.');
        return;
    }

    const parts = [];
    if (char.name)        parts.push(`이름: ${char.name}`);
    if (char.description) parts.push(char.description.trim());
    if (char.personality) parts.push(`성격: ${char.personality.trim()}`);
    if (char.scenario)    parts.push(`시나리오: ${char.scenario.trim()}`);

    const descEl = document.getElementById('firstmsg-char-desc');
    if (descEl) descEl.value = parts.join('\n\n');

    const greetEl = document.getElementById('firstmsg-greeting');
    if (greetEl && char.first_mes) greetEl.value = char.first_mes;

    persistInputs();
    toastr.success(`"${char.name}" 캐릭터 정보를 불러왔습니다.`);
}

// ── 생성 핸들러 ───────────────────────────────────────────────
async function handleGenerate() {
    const charDesc    = getVal('firstmsg-char-desc');
    const greeting    = getVal('firstmsg-greeting');
    const userNote    = getVal('firstmsg-user-note');
    const useActions  = getChecked('firstmsg-use-actions');
    const useDialogue = getChecked('firstmsg-use-dialogue');
    const korean      = getChecked('firstmsg-korean');

    if (!charDesc.trim() && !greeting.trim()) {
        toastr.error('캐릭터 설명 또는 그리팅 중 하나는 입력해주세요!');
        return;
    }

    // Connection Profile 전환
    const profileId = getVal('firstmsg-profile-select');
    if (profileId) {
        await switchProfile(profileId);
    }

    setLoading(true, '생성 중...');

    try {
        const { systemPrompt, userPrompt } = buildPrompt({
            charDesc, greeting, userNote, useActions, useDialogue, korean,
        });

        // ST 내장 generateRaw 사용 — API 키 불필요
        const { generateRaw } = SillyTavern.getContext();
        const result = await generateRaw({
            systemPrompt,
            prompt: userPrompt,
        });

        if (!result || result.trim() === '') {
            toastr.error('생성 결과가 비어있습니다. API 연결 상태를 확인해주세요.');
            return;
        }

        showResult(result.trim());
        toastr.success('퍼스트 메시지 생성 완료!');
    } catch (err) {
        console.error(`[${MODULE_NAME}] 생성 오류:`, err);
        toastr.error(`생성 중 오류가 발생했습니다: ${err.message ?? err}`);
    } finally {
        setLoading(false);
        // 프로필 원복은 하지 않음 (사용자가 선택한 상태 유지)
    }
}

// ── Connection Profile 전환 ───────────────────────────────────
async function switchProfile(profileId) {
    if (!profileId) return;
    try {
        // ST의 /api/connection-profiles/activate 엔드포인트 사용
        const resp = await fetch('/api/connection-profiles/activate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: profileId }),
        });
        if (!resp.ok) {
            // 실패해도 계속 진행 (현재 API로 생성)
            console.warn(`[${MODULE_NAME}] 프로필 전환 실패 (${resp.status}), 현재 API로 계속 진행`);
        }
    } catch (err) {
        console.warn(`[${MODULE_NAME}] 프로필 전환 중 오류:`, err);
    }
}

// ── 프롬프트 빌더 ─────────────────────────────────────────────
function buildPrompt({ charDesc, greeting, userNote, useActions, useDialogue, korean }) {
    const langLine = korean
        ? '반드시 한국어로 작성하세요.'
        : 'Write in the same language as the provided character info.';

    const formatLines = [];
    if (useActions)  formatLines.push('행동 묘사는 *이탤릭체*로 감싸주세요. 예: *그가 천천히 고개를 든다*');
    if (useDialogue) formatLines.push('캐릭터의 말은 자연스럽게 대화 속에 포함해주세요.');
    if (!useActions && !useDialogue) formatLines.push('대사 없이 서술형으로만 작성해주세요.');

    const systemPrompt = `당신은 롤플레이 채팅의 "퍼스트 메시지(First Message)"를 전문으로 대필하는 작가입니다.

퍼스트 메시지란 롤플레이가 시작될 때 AI 캐릭터가 유저에게 처음 보내는 메시지입니다. 캐릭터의 성격과 말투가 즉시 드러나야 하고, 유저가 자연스럽게 반응하고 싶어지는 분위기를 만들어야 합니다.

[작성 원칙]
- 캐릭터 설명에서 말투, 어투, 성격을 정확히 파악해 그대로 반영하세요.
- 그리팅 속 NPC, 세계관, 상황이 있다면 살려서 녹여주세요.
- 3인칭 서술과 1인칭 대사를 자연스럽게 섞어 생동감 있게 작성하세요.
- {{user}}, {{char}} 같은 SillyTavern 변수는 그대로 유지하세요.
${formatLines.map(l => '- ' + l).join('\n')}
- ${langLine}
- 퍼스트 메시지 본문만 출력하세요. 제목, 설명, 메타 코멘트 없이.`;

    let userPrompt = '';
    if (charDesc.trim()) userPrompt += `[캐릭터 정보]\n${charDesc.trim()}\n\n`;
    if (greeting.trim()) userPrompt += `[기존 그리팅 / 참고 씬]\n${greeting.trim()}\n\n`;
    if (userNote.trim()) userPrompt += `[추가 요청]\n${userNote.trim()}\n\n`;
    userPrompt += '위 정보를 바탕으로 퍼스트 메시지를 작성해주세요.';

    return { systemPrompt, userPrompt };
}

// ── UI 헬퍼 ──────────────────────────────────────────────────
function setLoading(on, msg = '생성 중...') {
    const loadEl  = document.getElementById('firstmsg-loading');
    const loadTxt = document.getElementById('firstmsg-loading-text');
    const genBtn  = document.getElementById('firstmsg-generate-btn');
    const regenBtn = document.getElementById('firstmsg-regen-btn');

    if (loadEl)   loadEl.style.display  = on ? 'flex' : 'none';
    if (loadTxt)  loadTxt.textContent   = msg;
    if (genBtn)   genBtn.disabled       = on;
    if (regenBtn) regenBtn.disabled     = on;
}

function showResult(text) {
    const area   = document.getElementById('firstmsg-result-area');
    const result = document.getElementById('firstmsg-result');
    if (result) result.value = text;
    if (area)   area.style.display = 'flex';
    updateCharCount();
    // 결과로 스크롤
    area?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function updateCharCount() {
    const result = document.getElementById('firstmsg-result');
    const count  = document.getElementById('firstmsg-char-count');
    if (result && count) count.textContent = `${result.value.length}자`;
}

async function handleCopy() {
    const result = document.getElementById('firstmsg-result');
    if (!result?.value) return;
    await navigator.clipboard.writeText(result.value);
    toastr.success('클립보드에 복사했습니다!');
}

function handleClear() {
    ['firstmsg-char-desc', 'firstmsg-greeting', 'firstmsg-user-note', 'firstmsg-result']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const area = document.getElementById('firstmsg-result-area');
    if (area) area.style.display = 'none';
    persistInputs();
    toastr.info('초기화되었습니다.');
}

// ── 유틸 ──────────────────────────────────────────────────────
function on(id, event, fn) {
    document.getElementById(id)?.addEventListener(event, fn);
}
function getVal(id)          { return document.getElementById(id)?.value ?? ''; }
function setVal(id, v)       { const el = document.getElementById(id); if (el) el.value = v ?? ''; }
function getChecked(id)      { return document.getElementById(id)?.checked ?? false; }
function setChecked(id, v)   { const el = document.getElementById(id); if (el) el.checked = !!v; }

// ── 진입점 ────────────────────────────────────────────────────
jQuery(async () => {
    const { eventSource, event_types } = SillyTavern.getContext();

    // APP_READY는 이미 발생했을 수도 있으므로 on() 사용
    // (ST의 on()은 이미 발생한 이벤트에 대해 즉시 핸들러를 호출함)
    eventSource.on(event_types.APP_READY, async () => {
        await loadPanel();
        console.log(`[${MODULE_NAME}] Extension loaded.`);
    });

    // 구버전 ST fallback: 2초 후에도 패널이 없으면 강제 로드
    setTimeout(async () => {
        if (!document.getElementById('firstmsg-generate-btn')) {
            await loadPanel();
            console.log(`[${MODULE_NAME}] Extension loaded (fallback).`);
        }
    }, 2000);
});
