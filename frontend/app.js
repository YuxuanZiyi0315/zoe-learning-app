// 英语学习助手 - 前端 JavaScript (v4 - 修复版)

const API_BASE = '/api';

const state = {
    currentRole: null,
    currentUser: null,
    currentClass: null,
    currentAssignment: null,
    currentQuestion: 0,
    questions: [],
    answers: {},
    inputMode: 'text',
    generatedQuestions: null,
    classes: [],
    assignments: [],
    currentAssignmentId: null
};

// ============ 工具函数 ============

function showToast(message) {
    var existing = document.querySelector('.toast-msg');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.8);color:white;padding:12px 24px;border-radius:8px;font-size:16px;z-index:2000;transition:opacity 0.3s';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function() { toast.style.opacity = '0'; setTimeout(function() { toast.remove(); }, 300); }, 2000);
}

function closeModal() {
    document.getElementById('modal').classList.remove('active');
}


function resetPreview() {
    state.generatedQuestions = null;
    document.getElementById('preview-area').style.display = 'none';
}

function showModal(title, message, onConfirm) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-message').innerHTML = message;
    document.getElementById('modal-confirm').onclick = onConfirm || function() { closeModal(); };
    document.getElementById('modal').classList.add('active');
}

function showLoading(text) {
    text = text || '老师正在生成题目';
    document.getElementById('loading-text').textContent = text;
    document.getElementById('loading-overlay').classList.add('active');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.remove('active');
}

function getTypeName(type) {
    var map = { choice: '选择题', fill: '填空题', translate: '翻译题', 'choice': '选择题', 'fill': '填空题', 'translate': '翻译题' };
    return map[type] || type;
}

async function api(path, options) {
    options = options || {};
    try {
        var res = await fetch(API_BASE + path, {
            headers: { 'Content-Type': 'application/json' },
            method: options.method || 'GET',
            body: options.body || undefined
        });
        return await res.json();
    } catch (e) {
        console.error('API Error:', e);
        return { code: -1, message: '网络请求失败，请检查网络连接' };
    }
}

// ============ 登录 ============

function switchLoginTab(role) {
    document.querySelectorAll('.login-tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('.login-form').forEach(function(f) { f.classList.remove('active'); });
    if (role === 'student') {
        document.querySelector('.login-tab:first-child').classList.add('active');
        document.getElementById('student-login').classList.add('active');
    } else {
        document.querySelector('.login-tab:last-child').classList.add('active');
        document.getElementById('teacher-login').classList.add('active');
    }
}

async function teacherLogin() {
    var code = document.getElementById('teacher-code').value.trim();
    if (!code) { showToast('请输入教师编号'); return; }
    var res = await api('/teacher/login', { method: 'POST', body: JSON.stringify({ code: code }) });
    if (res.code === 0) {
        state.currentRole = 'teacher';
        state.currentUser = res.data;
        document.getElementById('login-page').classList.remove('active');
        document.getElementById('teacher-page').classList.add('active');
        loadClasses();
        showToast('登录成功');
    } else {
        showToast(res.message || '登录失败');
    }
}

async function studentLogin() {
    var name = document.getElementById('student-name').value.trim();
    var classCode = document.getElementById('student-class').value.trim();
    if (!name || !classCode) { showToast('请输入姓名和班级编号'); return; }
    var res = await api('/student/login', { method: 'POST', body: JSON.stringify({ name: name, class_code: classCode }) });
    if (res.code === 0) {
        state.currentRole = 'student';
        state.currentUser = res.data;
        document.getElementById('login-page').classList.remove('active');
        document.getElementById('student-page').classList.add('active');
        loadStudentAssignments();
        showToast('登录成功');
    } else {
        showToast(res.message || '登录失败');
    }
}

function logout() {
    if (state.currentAssignment && state.questions.length > 0) {
        var hasAnswers = Object.keys(state.answers).length > 0;
        if (hasAnswers) {
            showModal('确认退出', '你正在答题，确定要退出吗？<br>未提交的答案将保存为草稿。', function() { closeModal(); doLogout(); });
            return;
        }
    }
    doLogout();
}

function doLogout() {
    state.currentRole = null;
    state.currentUser = null;
    state.currentClass = null;
    state.currentAssignment = null;
    state.generatedQuestions = null;
    state.questions = [];
    state.answers = {};
    document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
    document.getElementById('login-page').classList.add('active');
    switchLoginTab('student');
}

// ============ 教师端 - 班级 ============

function showTeacherSection(section) {
    document.querySelectorAll('#teacher-page .section').forEach(function(s) { s.classList.remove('active'); });
    document.querySelectorAll('#teacher-page .nav-link').forEach(function(l) { l.classList.remove('active'); });
    document.getElementById(section + '-section').classList.add('active');
    var navMap = { classes: '班级', assignments: '作业', homework: '作业', 'class-detail': '班级' };
    if (section === 'assignments' && state.currentClass) {
        loadAssignments(state.currentClass.id);
    }
    document.querySelectorAll('#teacher-page .nav-link').forEach(function(l) {
        if (l.textContent.trim() === navMap[section]) l.classList.add('active');
    });
}

async function loadClasses() {
    document.getElementById('classes-list').innerHTML = '<div class="skeleton-card skeleton-block"></div><div class="skeleton-card skeleton-block"></div><div class="skeleton-card skeleton-block"></div>';
    var res = await api('/classes?teacher_id=' + state.currentUser.id);
    if (res.code === 0) {
        state.classes = res.data;
        renderClasses();
    }
}

function renderClasses() {
    var container = document.getElementById('classes-list');
    if (!state.classes || state.classes.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📎</div><div>还没有班级</div><div style="color:var(--text-light);font-size:13px;margin-top:8px;">点击右上角创建班级</div></div>';
        return;
    }
    container.innerHTML = state.classes.map(function(c) {
        return '<div class="list-item" style="cursor:pointer;" onclick="viewClassDetail(' + c.id + ')">' +
            '<div class="list-item-title">' + c.name + '</div>' +
            '<div class="list-item-desc">班级编号：' + c.code + '</div>' +
        '</div>';
    }).join('');
}

function showCreateClass() {
    showModal('创建班级', '请输入班级名称：<br><input type="text" id="new-class-name" class="input-field" style="margin-top:8px;" placeholder="例如：三年级一班">', async function() {
        var name = document.getElementById('new-class-name').value.trim();
        if (!name) { showToast('请输入班级名称'); return; }
        var res = await api('/classes', { method: 'POST', body: JSON.stringify({ teacher_id: state.currentUser.id, name: name }) });
        if (res.code === 0) {
            showToast('创建成功');
            closeModal();
            loadClasses();
        } else {
            showToast(res.message || '创建失败');
        }
    });
}

async function viewClassDetail(classId) {
    var cls = state.classes.find(function(c) { return c.id === classId; });
    if (!cls) return;
    state.currentClass = cls;
    showLoading('加载中...');
    var assignRes = await api('/assignments?class_id=' + classId);
    var studentsRes = await api('/students?class_id=' + classId);
    hideLoading();
    var assignments = (assignRes.code === 0) ? assignRes.data : [];
    var students = (studentsRes.code === 0) ? studentsRes.data : [];

    document.getElementById('class-detail-title').textContent = cls.name;

    var content = document.getElementById('class-detail-info');
    var html = '<div style="margin-bottom:16px;padding:16px;background:#f9f9f9;border-radius:8px;">' +
        '<p style="color:#666;margin-bottom:4px;">班级编号：<strong>' + cls.code + '</strong></p>' +
        '<p style="color:#666;">学生人数：' + students.length + ' 人</p>' +
    '</div>';

    html += '<h4 style="margin-bottom:12px;color:#333;">📝 班级作业</h4>';

    if (assignments.length === 0) {
        html += '<div style="text-align:center;padding:30px 20px;color:#999;"><div style="font-size:48px;margin-bottom:12px;">📝</div><div>暂无作业，请先创建作业</div></div>';
    } else {
        html += assignments.map(function(a) {
            return '<div class="list-item" style="cursor:pointer;" onclick="viewAssignmentDetail(' + a.id + ')">' +
                '<div class="list-item-title">' + a.title + '</div>' +
                '<div class="list-item-meta">' +
                    '<span>' + a.created_at + '</span>' +
                    '<span style="color:#1890FF;">查看提交 &gt;</span>' +
                '</div></div>';
        }).join('');
    }


    // 学生列表
    html += '<div style="margin-top:20px;border-top:1px solid #eee;padding-top:16px;">';
    html += '<h4 style="margin-bottom:12px;color:#333;">👨‍🎓 班级学生（' + students.length + '人）</h4>';
    if (students.length > 0) {
        html += '<div class="list-container">';
        html += students.map(function(s) {
            return '<div class="list-item">' +
                '<div class="list-item-title">' + s.name + '</div>' +
                (s.created_at ? '<div class="list-item-desc">加入时间：' + s.created_at + '</div>' : '') +
            '</div>';
        }).join('');
        html += '</div>';
    } else {
        html += '<div style="text-align:center;padding:20px;color:#999;"><div style="font-size:36px;margin-bottom:8px;">👨‍🎓</div><div>还没有学生加入，请分享班级编号给学生</div></div>';
    }
    html += '</div>';

    // 删除班级
    html += '<div style="margin-top:24px;text-align:center;">';
    html += '<button class="btn btn-danger btn-small" onclick="confirmDeleteClass(' + cls.id + ')" style="font-size:13px;padding:6px 16px;">删除班级</button>';
    html += '</div>';

    content.innerHTML = html;

    document.querySelectorAll('#teacher-page .section').forEach(function(s) { s.classList.remove('active'); });
    document.querySelectorAll('#teacher-page .nav-link').forEach(function(l) { l.classList.remove('active'); });
    document.getElementById('class-detail-section').classList.add('active');
}

// ============ 教师端 - 作业管理 ============

async function loadAssignments(classId) {
    var res = await api('/assignments?class_id=' + classId);
    if (res.code === 0) {
        state.assignments = res.data;
        renderAssignments();
    }
}

function renderAssignments() {
    var container = document.getElementById('assignments-list');
    if (!state.assignments || state.assignments.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📑</div><div>还没有作业</div><div style="color:var(--text-light);font-size:13px;margin-top:8px;">点击右上角创建作业</div></div>';
        return;
    }
    container.innerHTML = state.assignments.map(function(a) {
        return '<div class="list-item">' +
            '<div class="list-item-title">' + a.title + '</div>' +
            '<div class="list-item-meta">' +
                '<span>' + a.created_at + '</span>' +
                '<button class="btn btn-small btn-secondary" onclick="viewAssignmentDetail(' + a.id + ')">查看提交</button>' +
            '</div></div>';
    }).join('');
}

function showCreateAssignment() {
    if (state.classes.length === 0) {
        showToast('请先创建班级');
        return;
    }
    state.generatedQuestions = null;
    state.inputMode = 'text';
    document.querySelectorAll('#teacher-page .section').forEach(function(s) { s.classList.remove('active'); });
    document.getElementById('create-assignment-section').classList.add('active');
    document.getElementById('preview-area').style.display = 'none';
    document.getElementById('assignment-title-input').value = '';
    document.getElementById('class-content').value = '';
    document.getElementById('question-count').value = '5';
    document.getElementById('teacher-prompt').value = '';
    document.getElementById('text-input').style.display = '';
    document.getElementById('photo-input').style.display = 'none';
    document.querySelectorAll('.toggle-item').forEach(function(t) { t.classList.remove('active'); });
    document.querySelector('.toggle-item:first-child').classList.add('active');

    if (!document.getElementById('class-select')) {
        var selectHtml = '<div class="input-group" id="class-select-group">' +
            '<label class="input-label">选择班级</label>' +
            '<select id="class-select" class="input-field">' +
            state.classes.map(function(c) { return '<option value="' + c.id + '">' + c.name + '</option>'; }).join('') +
            '</select></div>';
        var firstInputGroup = document.querySelector('#create-assignment-section .card .input-group');
        firstInputGroup.insertAdjacentHTML('beforebegin', selectHtml);
    } else {
        var select = document.getElementById('class-select');
        select.innerHTML = state.classes.map(function(c) { return '<option value="' + c.id + '">' + c.name + '</option>'; }).join('');
    }
}

function switchInputMode(mode) {
    state.inputMode = mode;
    document.querySelectorAll('.toggle-item').forEach(function(t) { t.classList.remove('active'); });
    document.querySelector('.toggle-item[data-mode="' + mode + '"]').classList.add('active');
    document.getElementById('text-input').style.display = mode === 'text' ? '' : 'none';
    document.getElementById('photo-input').style.display = mode === 'photo' ? '' : 'none';
}

async function generatePreview() {
    var title = document.getElementById('assignment-title-input').value.trim();
    var content = document.getElementById('class-content').value.trim();
    var numQuestions = parseInt(document.getElementById('question-count').value) || 5;
    var teacherPrompt = document.getElementById('teacher-prompt').value.trim();

    if (!title) { showToast('请填写作业标题'); return; }
    if (state.inputMode === 'text' && !content) { showToast('请输入课堂内容'); return; }

    var btn = document.getElementById('generate-btn');
    btn.disabled = true;
    btn.textContent = '生成中...';
    showLoading('老师正在生成题目');

    var body = { title: title, content: content, num_questions: numQuestions, input_mode: state.inputMode, prompt: teacherPrompt };

    if (state.inputMode === 'photo') {
        var fileInput = document.getElementById('photo-upload');
        if (fileInput.files && fileInput.files[0]) {
            var reader = new FileReader();
            reader.onload = async function(e) {
                body.image = e.target.result.split(',')[1];
                await doGeneratePreview(body, btn);
            };
            reader.readAsDataURL(fileInput.files[0]);
        } else {
            showToast('请上传图片');
            btn.disabled = false;
            btn.textContent = '生成预览';
            hideLoading();
            return;
        }
        return;
    }

    await doGeneratePreview(body, btn);
}



async function testAIConnection() {
    var apiKey = document.getElementById("ai-api-key-input").value.trim();
    if (!apiKey) { document.getElementById("ai-test-result").innerHTML = '<span style="color:#666;">使用默认 Key，无需测试</span>'; return; }
    var resultEl = document.getElementById("ai-test-result");
    var btn = document.getElementById("test-api-btn");
    btn.disabled = true;
    btn.textContent = "连接中...";
    resultEl.innerHTML = '<span style="color:#666;">正在测试...</span>';
    var res = await api("/ai/test-connection", { method: "POST", body: JSON.stringify({ api_key: apiKey }) });
    btn.disabled = false;
    btn.textContent = "测试连接";
    if (res.code === 0 && res.data && res.data.ok) {
        resultEl.innerHTML = '<span style="color:#52c41a;">✅ 连接成功</span>';
    } else {
        resultEl.innerHTML = '<span style="color:#ff4d4f;">❌ 连接失败：' + (res.message || "无法连接") + '</span>';
    }
}

async function doGeneratePreview(body, btn) {
    var savedKey = document.getElementById('ai-api-key-input').value.trim();
    if (savedKey) body.ai_api_key = savedKey;
    var res = await api('/assignments/generate', { method: 'POST', body: JSON.stringify(body) });
    hideLoading();
    btn.disabled = false;
    btn.textContent = '生成预览';
    if (res.code === 0) {
        state.generatedQuestions = Array.isArray(res.data) ? res.data : (res.data.questions || []);
        renderPreview();
    } else {
        showToast(res.message || '生成失败，可能是网络波动，再试一次？');
    }
}

// ============ 手动出题 ============
var manualQuestionIdCounter = 0;

function toggleManualInput() {
    var area = document.getElementById('manual-input-area');
    if (area.style.display === 'none') {
        area.style.display = '';
        if (document.getElementById('manual-questions-list').children.length === 0) {
            addManualQuestion();
        }
    } else {
        area.style.display = 'none';
    }
}

function addManualQuestion() {
    manualQuestionIdCounter++;
    var id = manualQuestionIdCounter;
    var list = document.getElementById('manual-questions-list');
    var div = document.createElement('div');
    div.className = 'manual-question-item';
    div.id = 'mq-' + id;
    div.style.cssText = 'border:1px solid #e8e8e8;border-radius:12px;padding:16px;margin-bottom:12px;background:#fafafa;position:relative;';
    div.innerHTML = 
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
            '<span style="font-weight:600;color:#333;">第 ' + id + ' 题</span>' +
            '<button class="btn btn-small btn-danger" onclick="removeManualQuestion(' + id + ')" style="background:#ff4d4f;color:white;border:none;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:12px;">删除</button>' +
        '</div>' +
        '<div class="input-group" style="margin-bottom:8px;">' +
            '<select id="mq-type-' + id + '" class="input-field" onchange="toggleManualOptions(' + id + ')">' +
                '<option value="choice">选择题</option>' +
                '<option value="fill">填空题</option>' +
                '<option value="translation">翻译题</option>' +
            '</select>' +
        '</div>' +
        '<div class="input-group" style="margin-bottom:8px;">' +
            '<textarea id="mq-question-' + id + '" class="input-field" placeholder="请输入题目内容..." style="min-height:60px;"></textarea>' +
        '</div>' +
        '<div id="mq-options-area-' + id + '" class="input-group" style="margin-bottom:8px;">' +
            '<label class="input-label" style="font-size:13px;color:#666;">选项（每行一个）</label>' +
            '<textarea id="mq-options-' + id + '" class="input-field" placeholder="选项A\n选项B\n选项C\n选项D" style="min-height:80px;"></textarea>' +
        '</div>' +
        '<div class="input-group">' +
            '<label class="input-label" style="font-size:13px;color:#666;">参考答案</label>' +
            '<input type="text" id="mq-answer-' + id + '" class="input-field" placeholder="请输入正确答案...">' +
        '</div>';
    list.appendChild(div);
    // Scroll to the new item
    div.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function removeManualQuestion(id) {
    var el = document.getElementById('mq-' + id);
    if (el) el.remove();
}

function toggleManualOptions(id) {
    var type = document.getElementById('mq-type-' + id).value;
    var optionsArea = document.getElementById('mq-options-area-' + id);
    optionsArea.style.display = type === 'choice' ? '' : 'none';
}

function collectManualQuestions() {
    var questions = [];
    var items = document.querySelectorAll('#manual-questions-list .manual-question-item');
    items.forEach(function(item) {
        var id = item.id.replace('mq-', '');
        var type = document.getElementById('mq-type-' + id).value;
        var question = document.getElementById('mq-question-' + id).value.trim();
        var answer = document.getElementById('mq-answer-' + id).value.trim();
        if (!question || !answer) return;
        var q = { id: questions.length + 1, type: type, question: question, answer: answer };
        if (type === 'choice') {
            var optsText = document.getElementById('mq-options-' + id).value.trim();
            q.options = optsText ? optsText.split('\n').filter(function(o) { return o.trim(); }) : [];
        }
        questions.push(q);
    });
    return questions;
}

function useManualQuestions() {
    var title = document.getElementById('assignment-title-input').value.trim();
    if (!title) { showToast('请填写作业标题'); return; }
    var questions = collectManualQuestions();
    if (questions.length === 0) { showToast('请至少填写一道完整的题目（题目内容+答案）'); return; }
    state.generatedQuestions = questions;
    renderPreview();
    document.getElementById('manual-input-area').style.display = 'none';
    showToast('已加载 ' + questions.length + ' 道手动出题');
}

function renderPreview() {
    var qs = state.generatedQuestions;
    if (!Array.isArray(qs)) { showToast('生成的题目数据异常，请重试'); return; }
    if (qs.length === 0) return;
    document.getElementById('preview-area').style.display = '';
    document.getElementById('preview-count').textContent = qs.length;
    var container = document.getElementById('preview-questions');
    container.innerHTML = qs.map(function(q, i) {
        var answers = '';
        if (q.type === 'choice' && q.options) {
            answers = '<div style="margin-left:16px;color:#666;">' + q.options.map(function(o) { return '<div>' + o + '</div>'; }).join('') + '</div>';
        }
        return '<div class="preview-item" style="margin-bottom:16px;border:1px solid #e8e8e8;border-radius:12px;padding:16px;background:#fafafa;">' +
            '<div class="preview-item-header" style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">' +
                '<span style="display:inline-flex;width:28px;height:28px;border-radius:50%;background:#1890FF;color:white;align-items:center;justify-content:center;font-size:13px;font-weight:600;">' + (i + 1) + '</span>' +
                '<span style="background:#e6f7ff;color:#1890FF;padding:2px 10px;border-radius:4px;font-size:12px;">' + getTypeName(q.type) + '</span>' +
            '</div>' +
            '<div class="preview-item-content">' +
                '<p style="margin-bottom:8px;font-size:15px;line-height:1.6;">' + q.content + '</p>' + answers +
                '<div style="margin-top:10px;padding-top:10px;border-top:1px dashed #d9d9d9;color:#52c41a;font-size:14px;"><strong>参考答案：</strong>' + q.answer + '</div>' +
            '</div></div>';
    }).join('');
}

async function confirmCreateAssignment() {
    if (!state.generatedQuestions) { showToast('请先生成题目'); return; }
    var title = document.getElementById('assignment-title-input').value.trim();
    var classSelect = document.getElementById('class-select');
    var classId = parseInt(classSelect ? classSelect.value : (state.classes[0] ? state.classes[0].id : 0));
    if (!classId) { showToast('请选择班级'); return; }

    var clsName = (state.classes.find(function(c) { return c.id === classId; }) || {name: ''}).name;
    var msg = '<strong>作业标题：</strong>' + title + '<br><strong>班级：</strong>' + clsName + '<br><strong>题目数量：</strong>' + state.generatedQuestions.length + ' 题<br><br>确认后立即发布。';
    showModal('确认发布', msg, async function() {
        closeModal();
        showLoading('保存中...');
        var aiKey = document.getElementById('ai-api-key-input').value.trim();
        var res = await api('/assignments', { method: 'POST', body: JSON.stringify({
            class_id: classId, title: title, questions: state.generatedQuestions, ai_api_key: aiKey
        })});
        hideLoading();
        if (res.code === 0) {
            showToast('创建成功');
            state.generatedQuestions = null;
            showTeacherSection('assignments');
            loadAssignments(classId);
        } else {
            showToast(res.message || '保存失败');
        }
    });
}

// ============ 学生端 - 作业 ============

function showStudentSection(section) {
    document.querySelectorAll('#student-page .section').forEach(function(s) { s.classList.remove('active'); });
    document.querySelectorAll('#student-page .nav-link').forEach(function(l) { l.classList.remove('active'); });
    document.getElementById(section + '-section').classList.add('active');
    var navMap = { assignments: '我的作业', history: '历史记录', feedback: '历史记录' };
    document.querySelectorAll('#student-page .nav-link').forEach(function(l) {
        if (l.textContent.trim() === navMap[section]) l.classList.add('active');
    });
}

async function loadStudentAssignments() {
    if (!state.currentUser) return;
    var res = await api('/student/assignments?student_id=' + state.currentUser.id + '&class_id=' + state.currentUser.class_id);
    if (res.code === 0) {
        renderStudentAssignments(res.data);
    }
}



function confirmDeleteAssignment(assignmentId) {
    var asgn = state.assignments.find(function(a2) { return a2.id === assignmentId; });
    if (!asgn) return;
    showModal('确认删除', '确定要删除作业 "' + asgn.title + '" 吗？<br>此操作不可恢复。', async function() {
        var res = await api('/assignments/' + assignmentId, { method: 'DELETE' });
        closeModal();
        if (res.code === 0) {
            showToast('删除成功');
            showTeacherSection('assignments');
            if (state.currentClass) loadAssignments(state.currentClass.id);
        } else {
            showToast(res.message || '删除失败');
        }
    });
}

function confirmDeleteClass(classId) {
    var cls = state.classes.find(function(c) { return c.id === classId; });
    if (!cls) return;
    showModal('确认删除', '确定要删除班级 "' + cls.name + '" 吗？<br>删除后该班级的所有学生和作业数据将一并清除，此操作不可恢复。', async function() {
        var res = await api('/classes/' + classId, { method: 'DELETE' });
        closeModal();
        if (res.code === 0) {
            showToast('删除成功');
            showTeacherSection('classes');
            loadClasses();
        } else {
            showToast(res.message || '删除失败');
        }
    });
}

function renderStudentAssignments(assignments) {
    var container = document.getElementById('student-assignments-list');
    if (!assignments || assignments.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#999;"><div style="font-size:48px;margin-bottom:16px;">🎀</div><div>暂无作业</div></div>';
        return;
    }
    container.innerHTML = assignments.map(function(a) {
        var st = a.submit_status;
        var statusMap = { pending: '待完成', submitted: '已提交', graded: '已批改' };
        var statusClass = { pending: 'pending', submitted: 'submitted', graded: 'graded' };
        var action;
        if (!st || st === 'pending') {
            action = '<button class="btn btn-small btn-primary" onclick="startAssignment(' + a.id + ')">开始做题</button>';
        } else if (st === 'graded') {
            action = '<button class="btn btn-small btn-secondary" onclick="viewFeedback(' + a.id + ')">查看结果</button>';
        } else {
            action = '<span style="color:#999;">已提交</span>';
        }
        return '<div class="list-item">' +
            '<div class="list-item-title">' + a.title + '</div>' +
            '<div class="list-item-meta">' +
                '<span class="list-item-status status-' + (statusClass[st] || 'pending') + '">' +
                    (statusMap[st] || '待完成') + (a.score != null ? ' · ' + a.score + '分' : '') +
                '</span>' +
                '<span>' + action + '</span>' +
            '</div></div>';
    }).join('');
}

async function startAssignment(assignmentId) {
    showLoading('加载中...');
    var res = await api('/assignments/' + assignmentId);
    hideLoading();
    if (res.code === 0 && res.data) {
        var assignment = res.data;
        state.currentAssignment = assignment;
        state.questions = assignment.questions || [];
        state.currentQuestion = 0;
        state.answers = {};
        // Try restore draft
        var draft = restoreDraft(assignmentId);
        if (draft && draft.answers) {
            state.answers = draft.answers;
            state.currentQuestion = draft.currentQuestion || 0;
        }

        document.getElementById('do-assignment-title').textContent = assignment.title;
        renderQuestion();
        showStudentSection('do-assignment');
    } else {
        showToast('加载失败');
    }
}

// ============ 手势滑动支持 ============

var touchStartX = 0;
var touchEndX = 0;

function setupSwipe() {
    var container = document.getElementById('question-container');
    if (!container) return;
    container.addEventListener('touchstart', function(e) {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    container.addEventListener('touchend', function(e) {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }, { passive: true });
}

function handleSwipe() {
    var threshold = 50;
    var diff = touchStartX - touchEndX;
    if (Math.abs(diff) > threshold) {
        if (diff > 0) {
            if (state.currentQuestion < state.questions.length - 1) nextQuestion();
        } else {
            if (state.currentQuestion > 0) prevQuestion();
        }
    }
}

function autoResizeAndSave(el, qIdx) {
    el.style.height = '';
    el.style.height = el.scrollHeight + 'px';
    state.answers[qIdx] = el.value;
    saveDraft();
}

function renderQuestion() {
    var q = state.questions[state.currentQuestion];
    if (!q) return;
    var container = document.getElementById('question-container');
    var total = state.questions.length;
    var current = state.currentQuestion + 1;

    document.getElementById('progress-fill').style.width = (current / total * 100) + '%';
    document.getElementById('progress-text').textContent = current + '/' + total;
    document.getElementById('prev-btn').style.display = state.currentQuestion === 0 ? 'none' : '';
    document.getElementById('next-btn').style.display = state.currentQuestion === total - 1 ? 'none' : '';
    document.getElementById('submit-btn').style.display = state.currentQuestion === total - 1 ? '' : 'none';

    var html = '<div class="question-number">第 ' + current + ' 题（共 ' + total + ' 题）</div>' +
        '<div class="progress-dots">';
      for (var di = 0; di < total; di++) {
          var dotClass = di === state.currentQuestion ? 'current' : (state.answers[di] ? 'answered' : '');
          html += '<div class="progress-dot ' + dotClass + '"></div>';
      }
      html += '</div>' +
        '<div class="question-text">' + (q.content || q.question) + '</div>';

    if (q.type === 'choice') {
        html += '<div class="options-list">';
        if (q.options) {
            q.options.forEach(function(o, i) {
                var checked = state.answers[state.currentQuestion] === o ? 'checked' : '';
                html += '<label class="option-item">' +
                    '<input type="radio" name="question" value="' + o + '" ' + checked + ' onchange="state.answers[' + state.currentQuestion + ']=this.value;saveDraft()">' +
                    '<span>' + o + '</span></label>';
            });
        }
        html += '</div>';
    } else {
        var val = state.answers[state.currentQuestion] || '';
        html += '<textarea class="answer-input" placeholder="请输入你的答案..." oninput="autoResizeAndSave(this, ' + state.currentQuestion + ')">' + val + '</textarea>';
    }

    container.innerHTML = html;
}

function prevQuestion() {
    if (state.currentQuestion > 0) {
        state.currentQuestion--;
        renderQuestion();
    }
}

function nextQuestion() {
    if (state.currentQuestion < state.questions.length - 1) {
        state.currentQuestion++;
        renderQuestion();
    }
}

function showSubmitConfirm() {
    var unanswered = 0;
    for (var i = 0; i < state.questions.length; i++) {
        if (!state.answers[i] || state.answers[i].trim() === '') unanswered++;
    }
    var msg = unanswered > 0 ? '还有 ' + unanswered + ' 道题未作答，确定要提交吗？' : '确定要提交作业吗？';
    showModal('确认提交', msg, submitAssignment);
}

async function submitAssignment() {
    showLoading('AI批改中，请稍候...');
    // 将 answers key 从数组索引(0,1,2)映射为题目的 q.id
    var mappedAnswers = {};
    for (var i = 0; i < state.questions.length; i++) {
        var qId = state.questions[i].id;
        if (state.answers[i] !== undefined) {
            mappedAnswers[qId] = state.answers[i];
        }
    }
    var res = await api('/assignments/' + state.currentAssignment.id + '/submit', {
        method: 'POST', body: JSON.stringify({
            student_id: state.currentUser.id, answers: mappedAnswers
        })
    });
    hideLoading();
    if (res.code === 0) {
        renderFeedback(res.data);
        showStudentSection('feedback');
        showToast('提交成功！');
        clearDraft(state.currentAssignment.id);
        if (state.currentAssignment) {
            state.currentAssignment.submit_status = 'graded';
            state.currentAssignment.score = res.data.score;
        }
    } else {
        showToast(res.message || '提交失败，请重试');
    }
}

async function viewFeedback(assignmentId) {
    showLoading('加载中...');
    var res = await api('/submissions?assignment_id=' + assignmentId + '&student_id=' + state.currentUser.id);
    hideLoading();
    if (res.code === 0 && res.data && res.data.feedback) {
        renderFeedback(res.data.feedback);
        showStudentSection('feedback');
        setTimeout(function() {
            var el = document.getElementById('feedback-section');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    } else {
        showToast('加载失败，请稍后重试');
    }
}

function renderFeedback(feedback) {
    if (!feedback || !feedback.questions) {
        showToast('反馈数据异常');
        return;
    }
    var score = feedback.score || 0;
    var emoji = score >= 90 ? '🎉' : (score >= 60 ? '💪' : '🌱');
    var label = score >= 90 ? '太棒了！继续保持！' : (score >= 60 ? '做得很认真，继续加油！' : '每一次练习都是进步，加油！');
    document.getElementById('score-display').innerHTML = '' +
        '<span class="score-emoji">' + emoji + '</span>' +
        '<span>' + score + '分</span>' +
        '<span class="score-label">' + label + '</span>';
    var container = document.getElementById('feedback-container');
    container.innerHTML = feedback.questions.map(function(q, i) {
        return '<div class="feedback-item ' + (q.correct ? 'correct' : 'incorrect') + '">' +
            '<div class="feedback-header">' +
                '<span>第 ' + (i + 1) + ' 题</span>' +
                '<span class="feedback-status ' + (q.correct ? 'correct' : 'incorrect') + '">' +
                    (q.correct ? '✅ 正确' : '❌ 错误') +
                '</span>' +
            '</div>' +
            '<div class="feedback-content">' + (q.feedback || '') + '</div>' +
        '</div>';
    }).join('') +
    '<div class="teacher-comment">' +
        '<div class="comment-header">老师评语</div>' +
        '<div class="comment-body">' + (feedback.comment || '继续加油！') + '</div>' +
    '</div>';
}

// ============ 历史记录 ============

async function loadHistory() {
    var res = await api('/submissions?student_id=' + state.currentUser.id);
    if (res.code === 0) {
        var container = document.getElementById('history-list');
        if (!res.data || res.data.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#999;"><div style="font-size:48px;margin-bottom:16px;">📋</div><div>暂无历史记录</div></div>';
            return;
        }
        container.innerHTML = res.data.map(function(s) {
            return '<div class="list-item" onclick="viewFeedback(' + s.assignment_id + ')">' +
                '<div class="list-item-title">' + s.assignment_title + '</div>' +
                '<div class="list-item-meta">' +
                    '<span>' + (s.score != null ? s.score + '分' : '-') + '</span>' +
                    '<span>' + s.created_at + '</span>' +
                '</div></div>';
        }).join('');
    }
}

// ============ 教师端 - 作业详情与批改查看 ============

async function viewAssignmentDetail(assignmentId) {
    state.currentAssignmentId = assignmentId;
    showLoading('加载中...');
    var res = await api('/submissions?assignment_id=' + assignmentId);
    hideLoading();
    if (res.code !== 0) { showToast('加载失败'); return; }

    var subs = res.data || [];
    var assignmentsRes = await api('/assignments?class_id=' + state.currentClass.id);
    var assignments = (assignmentsRes.code === 0) ? assignmentsRes.data : [];
    var assignment = assignments.find(function(a) { return a.id === assignmentId; });
    var title = assignment ? assignment.title : '作业详情';
    document.getElementById('assignment-detail-title').textContent = title;

    var clsName = state.currentClass ? state.currentClass.name : '';
    var bread = '<div class="breadcrumb"><a onclick="loadClasses();showTeacherSection(\"classes\")">班级</a><span class="sep">/</span><a onclick="viewClassDetail(' + (state.currentClass ? state.currentClass.id : 0) + ')">' + clsName + '</a><span class="sep">/</span><span class="current">' + title + '</span></div>';

    var container = document.getElementById('assignment-detail-content');
    container.innerHTML = bread;
    if (subs.length === 0) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:#999;">暂无学生提交</div>';
    } else {
        container.innerHTML = subs.map(function(s) {
            return '<div class="list-item" style="cursor:pointer;" onclick="viewStudentSubmission(' + assignmentId + ',' + s.student_id + ')">' +
                '<div class="list-item-title">' + s.student_name + '</div>' +
                '<div class="list-item-meta">' +
                    '<span>得分：<strong>' + (s.score != null ? s.score + '分' : '-') + '</strong></span>' +
                    '<span>' + s.created_at + '</span>' +
                '</div></div>';
        }).join('');
    }

    // Delete assignment button
    container.innerHTML += '<div style="margin-top:12px;text-align:center;padding-top:12px;border-top:1px solid #eee;"><button class="btn btn-danger btn-small" onclick="confirmDeleteAssignment(' + assignmentId + ')">删除作业</button></div>';

        showTeacherSection('assignment-detail');
}

async function viewStudentSubmission(assignmentId, studentId) {
    showLoading('加载中...');
    var res = await api('/submissions?assignment_id=' + assignmentId + '&student_id=' + studentId);
    hideLoading();
    if (res.code !== 0 || !res.data) {
        showToast('未找到提交记录');
        return;
    }

    var assignRes = await api('/assignments/' + assignmentId);
    var questions = (assignRes.code === 0 && assignRes.data && assignRes.data.questions) ? assignRes.data.questions : [];

    document.getElementById('student-submission-title').textContent = '学生作业详情';
    var container = document.getElementById('student-submission-content');
    var clsName = state.currentClass ? state.currentClass.name : '';
    var title = document.getElementById('assignment-detail-title').textContent || '作业';
    var bread2 = '<div class="breadcrumb"><a onclick="loadClasses();showTeacherSection(\"classes\")">班级</a><span class="sep">/</span><a onclick="viewClassDetail(' + (state.currentClass ? state.currentClass.id : 0) + ')">' + clsName + '</a><span class="sep">/</span><a onclick="viewAssignmentDetail(' + assignmentId + ')">' + title + '</a><span class="sep">/</span><span class="current">学生详情</span></div>';
    container.innerHTML = bread2;

    var feedback = res.data.feedback;
    var answers = res.data.answers || {};

    var html = '<div style="margin-bottom:16px;">' +
        '<p style="color:#666;">得分：<strong style="font-size:20px;color:#1890FF;">' + (res.data.score || 0) + '分</strong></p>' +
    '</div>';

    if (feedback && feedback.questions) {
        html += feedback.questions.map(function(fq, i) {
            var q = questions[i] || {};
            var studentAns = answers[i] || answers[fq.id] || '(未作答)';
            return '<div class="feedback-item ' + (fq.correct ? 'correct' : 'incorrect') + '">' +
                '<div class="feedback-header">' +
                    '<span>第 ' + (i + 1) + ' 题</span>' +
                    '<span class="feedback-status ' + (fq.correct ? 'correct' : 'incorrect') + '">' +
                        (fq.correct ? '✅ 正确' : '❌ 错误') +
                    '</span>' +
                '</div>' +
                '<div class="feedback-content">' +
                    '<p><strong>题目：</strong>' + (q.content || '') + '</p>' +
                    (q.answer ? '<p><strong>正确答案：</strong>' + q.answer + '</p>' : '') +
                    '<p><strong>学生答案：</strong>' + studentAns + '</p>' +
                    '<p style="margin-top:8px;padding-top:8px;border-top:1px dashed #ddd;">' + (fq.feedback || '') + '</p>' +
                '</div></div>';
        }).join('');
    }

    if (feedback && feedback.comment) {
        html += '<div class="feedback-item" style="margin-top:12px;">' +
            '<div class="feedback-header"><span>老师评语</span></div>' +
            '<div class="feedback-content">' + feedback.comment + '</div>' +
        '</div>';
    }

    container.innerHTML = html;
    showTeacherSection('student-submission');
}

function backToClassDetail() {
    if (state.currentClass) {
        viewClassDetail(state.currentClass.id);
    } else {
        showTeacherSection('classes');
    }
}

function goBackFromSubmission() {
    if (state.currentAssignmentId) {
        viewAssignmentDetail(state.currentAssignmentId);
    } else {
        showTeacherSection('classes');
    }
}

// ============ 初始化 ============

// ============ 保存草稿 ============

function saveDraft() {
    if (!state.currentAssignment || !state.currentAssignment.id) return;
    try {
        var key = 'draft_' + state.currentAssignment.id + '_' + state.currentUser.id;
        var draft = {
            answers: state.answers,
            currentQuestion: state.currentQuestion,
            savedAt: new Date().toISOString()
        };
        localStorage.setItem(key, JSON.stringify(draft));
    } catch(e) { /* ignore */ }
}

function restoreDraft(assignmentId) {
    if (!state.currentUser) return null;
    try {
        var key = 'draft_' + assignmentId + '_' + state.currentUser.id;
        var raw = localStorage.getItem(key);
        if (!raw) return null;
        var draft = JSON.parse(raw);
        // Only restore within 24 hours
        var age = Date.now() - new Date(draft.savedAt).getTime();
        if (age > 86400000) { localStorage.removeItem(key); return null; }
        return draft;
    } catch(e) { return null; }
}

function clearDraft(assignmentId) {
    if (!state.currentUser) return;
    try {
        var key = 'draft_' + assignmentId + '_' + state.currentUser.id;
        localStorage.removeItem(key);
    } catch(e) { /* ignore */ }
}


document.addEventListener('DOMContentLoaded', function() {
    console.log('英语学习助手已加载 (v4)');
});
