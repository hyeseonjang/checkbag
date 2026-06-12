// ==========================================
// Firebase 설정 (Firebase Config)
// ==========================================
// 💡 안내: 아래 주석 처리된 부분에 본인의 Firebase 프로젝트 설정값을 입력한 후, 주석을 해제하세요.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

const firebaseConfig = {
    // apiKey: "YOUR_API_KEY",
    // authDomain: "YOUR_AUTH_DOMAIN",
    // databaseURL: "YOUR_DATABASE_URL",
    // projectId: "YOUR_PROJECT_ID",
    // storageBucket: "YOUR_STORAGE_BUCKET",
    // messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    // appId: "YOUR_APP_ID"
};

// ==========================================
// 1. 앱 초기화 및 상태 관리
// ==========================================
let db = null;
try {
    // Firebase 설정이 입력되었는지 확인 후 초기화 진행
    if (Object.keys(firebaseConfig).length > 0 && firebaseConfig.apiKey) {
        const app = initializeApp(firebaseConfig);
        db = getDatabase(app);
    } else {
        console.info("안내: Firebase Config가 아직 설정되지 않았습니다. 현재는 LocalStorage를 사용하여 브라우저에 임시 저장됩니다.");
    }
} catch (error) {
    console.error("Firebase 초기화 에러:", error);
}

// 요구사항 3: 별도 회원가입 없이 LocalStorage 기반 UUID 생성
function getOrCreateUUID() {
    let uuid = localStorage.getItem('checklist_app_uuid');
    if (!uuid) {
        // crypto.randomUUID가 지원되지 않는 구형 브라우저 호환성을 위한 대체 로직
        uuid = (crypto.randomUUID && crypto.randomUUID()) || ('user_' + new Date().getTime() + Math.random().toString(36).substring(2));
        localStorage.setItem('checklist_app_uuid', uuid);
    }
    return uuid;
}

const userId = getOrCreateUUID();

// 전역 상태 (데이터 모델)
let state = {
    lists: [], // 준비물 목록 배열
    forgottenStats: {} // 자주 깜빡하는 물건 통계 객체 (예: {"충전기": 3, "학생증": 1})
};

// ==========================================
// 2. 데이터 동기화 (Firebase & LocalStorage)
// ==========================================
function saveState() {
    // Firebase 즉시 저장 시도 (요구사항 4)
    if (db) {
        try {
            set(ref(db, `users/${userId}`), state).catch(e => console.error("Firebase 저장 실패:", e));
        } catch (error) {
            console.error("Firebase 접근 오류:", error);
        }
    }
    // 오프라인/설정 누락을 대비한 LocalStorage 백업 저장
    localStorage.setItem(`checklist_state_${userId}`, JSON.stringify(state));
    render(); // 상태가 변경될 때마다 화면 갱신
}

function loadState() {
    if (db) {
        const userRef = ref(db, `users/${userId}`);
        onValue(userRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                state.lists = data.lists || [];
                state.forgottenStats = data.forgottenStats || {};
                render();
            } else {
                loadLocalState();
            }
        }, { onlyOnce: true });
    } else {
        loadLocalState();
    }
}

function loadLocalState() {
    const localData = localStorage.getItem(`checklist_state_${userId}`);
    if (localData) {
        state = JSON.parse(localData);
    }
    render();
}

// ==========================================
// 3. 비즈니스 로직 및 이벤트 핸들링
// ==========================================
const DOM = {
    newListInput: document.getElementById('new-list-input'),
    addListBtn: document.getElementById('add-list-btn'),
    listsContainer: document.getElementById('lists-container'),
    forgottenList: document.getElementById('forgotten-list'),
    successPopup: document.getElementById('success-popup')
};

// 목록 생성 기능 (요구사항 5, 6, 7)
DOM.addListBtn.addEventListener('click', () => {
    const title = DOM.newListInput.value.trim();
    if (!title) {
        alert("목록 이름을 입력해주세요! (빈칸, 공백 불가)");
        return;
    }
    
    const newList = {
        id: Date.now().toString(),
        title: title,
        items: [],
        isFavorite: false
    };
    
    state.lists.push(newList);
    DOM.newListInput.value = '';
    saveState();
});

// 즐겨찾기 토글 기능
function toggleFavorite(listId) {
    const list = state.lists.find(l => l.id === listId);
    if (list) {
        list.isFavorite = !list.isFavorite;
        saveState();
    }
}

// 목록 전체 삭제 기능 (요구사항 13)
function deleteList(listId) {
    if (confirm("정말로 이 준비물 목록을 전체 삭제하시겠습니까?")) {
        state.lists = state.lists.filter(l => l.id !== listId);
        saveState();
    }
}

// 물건 추가 기능 (요구사항 9, 10, 12)
function addItem(listId, itemName) {
    itemName = itemName.trim();
    if (!itemName) return;

    const list = state.lists.find(l => l.id === listId);
    if (list) {
        // 중복 추가 방지 예외 처리 (요구사항 12)
        if (list.items.some(i => i.name === itemName)) {
            alert("이미 목록에 존재하는 준비물입니다.");
            return;
        }
        list.items.push({ id: Date.now().toString(), name: itemName, checked: false });
        saveState();
    }
}

// 개별 물건 삭제 기능 (요구사항 13)
function deleteItem(listId, itemId) {
    const list = state.lists.find(l => l.id === listId);
    if (list) {
        list.items = list.items.filter(i => i.id !== itemId);
        saveState();
    }
}

// 체크박스 토글 기능 (요구사항 16)
function toggleItemCheck(listId, itemId) {
    const list = state.lists.find(l => l.id === listId);
    if (list) {
        const item = list.items.find(i => i.id === itemId);
        if (item) {
            item.checked = !item.checked;
            saveState(); // 즉시 저장 (요구사항 4)
            
            if (item.checked) {
                checkAllItemsCompleted(list); // 완료 여부 실시간 감지 (요구사항 21)
            }
        }
    }
}

// 물건 텍스트 클릭 시 이름 변경 기능 (요구사항 11)
function editItemName(listId, itemId) {
    const list = state.lists.find(l => l.id === listId);
    if (list) {
        const item = list.items.find(i => i.id === itemId);
        if (item) {
            const newName = prompt("준비물 이름을 수정하세요:", item.name);
            if (newName !== null) {
                const trimmed = newName.trim();
                if (!trimmed) {
                    alert("이름은 비워둘 수 없습니다.");
                    return;
                }
                if (list.items.some(i => i.id !== itemId && i.name === trimmed)) {
                    alert("이미 존재하는 준비물 이름입니다.");
                    return;
                }
                item.name = trimmed;
                saveState();
            }
        }
    }
}

// 완료 감지 및 팝업 표시 (요구사항 21, 22, 23)
function checkAllItemsCompleted(list) {
    if (list.items.length > 0 && list.items.every(i => i.checked)) {
        showSuccessPopup();
    }
}

function showSuccessPopup() {
    DOM.successPopup.classList.remove('hidden');
    // 2.5초 후 팝업 자동 숨김
    setTimeout(() => {
        DOM.successPopup.classList.add('hidden');
    }, 2500);
}

// 외출하기(점검 완료) 기능 (요구사항 24, 25, 29)
function checkoutList(list) {
    if (list.items.length === 0) {
        alert("먼저 준비물을 추가해주세요.");
        return;
    }

    const uncheckedItems = list.items.filter(i => !i.checked);
    
    if (uncheckedItems.length > 0) {
        // 요구사항 29: 미체크 항목 경고 메시지
        alert("아직 챙기지 않은 준비물이 있습니다! 다시 한 번 확인해주세요.");
        
        // 요구사항 25: 깜빡한 물건 횟수 누적
        uncheckedItems.forEach(item => {
            if (!state.forgottenStats[item.name]) {
                state.forgottenStats[item.name] = 0;
            }
            state.forgottenStats[item.name]++;
        });
        saveState(); // 통계 업데이트 저장
    } else {
        if(confirm("외출 준비 완료! 다음을 위해 목록의 체크 상태를 초기화하시겠습니까?")) {
            list.items.forEach(i => i.checked = false);
            saveState();
        }
    }
}

// ==========================================
// 4. 화면 렌더링 함수 (UI 업데이트)
// ==========================================
function render() {
    renderDashboard();
    
    DOM.listsContainer.innerHTML = '';
    
    // 요구사항 19: 즐겨찾기(isFavorite) 설정된 목록이 상단에 고정되도록 정렬
    const sortedLists = [...state.lists].sort((a, b) => {
        if (a.isFavorite === b.isFavorite) return 0;
        return a.isFavorite ? -1 : 1;
    });

    sortedLists.forEach(list => {
        // 카드 형태 UI 생성 (요구사항 8)
        const card = document.createElement('div');
        card.className = 'list-card';
        
        // --- 1) 카드 상단: 즐겨찾기 아이콘, 제목, 삭제 버튼 ---
        const header = document.createElement('div');
        header.className = 'list-header';
        
        const titleWrap = document.createElement('div');
        titleWrap.className = 'list-title-wrap';
        
        // 즐겨찾기 버튼 (요구사항 18)
        const starBtn = document.createElement('button');
        starBtn.className = `star-btn ${list.isFavorite ? 'active' : ''}`;
        starBtn.innerHTML = list.isFavorite ? '★' : '☆';
        starBtn.onclick = () => toggleFavorite(list.id);
        
        const title = document.createElement('h3');
        title.className = 'list-title';
        title.textContent = list.title;
        
        titleWrap.appendChild(starBtn);
        titleWrap.appendChild(title);
        
        const deleteListBtn = document.createElement('button');
        deleteListBtn.className = 'delete-list-btn';
        deleteListBtn.innerHTML = '✖';
        deleteListBtn.title = '목록 삭제';
        deleteListBtn.onclick = () => deleteList(list.id);
        
        header.appendChild(titleWrap);
        header.appendChild(deleteListBtn);
        
        // --- 2) 준비물 추가 입력창 영역 ---
        const adder = document.createElement('div');
        adder.className = 'item-adder';
        
        const itemInput = document.createElement('input');
        itemInput.type = 'text';
        itemInput.placeholder = '추가할 준비물 (예: 학생증, 노트북)';
        itemInput.onkeypress = (e) => {
            if (e.key === 'Enter') {
                addItem(list.id, itemInput.value);
                itemInput.value = '';
            }
        };
        
        const itemAddBtn = document.createElement('button');
        itemAddBtn.textContent = '추가';
        itemAddBtn.onclick = () => {
            addItem(list.id, itemInput.value);
            itemInput.value = '';
        };
        
        adder.appendChild(itemInput);
        adder.appendChild(itemAddBtn);
        
        // --- 3) 개별 준비물 리스트 렌더링 ---
        const ul = document.createElement('ul');
        ul.className = 'items-list';
        
        list.items.forEach(item => {
            const li = document.createElement('li');
            li.className = 'item-row';
            
            const left = document.createElement('div');
            left.className = 'item-left';
            
            // 시각적 체크박스 구현 (요구사항 15: '□ 학생증' 형태)
            const checkSpan = document.createElement('span');
            checkSpan.className = 'custom-checkbox';
            checkSpan.textContent = item.checked ? '☑' : '□';
            checkSpan.onclick = () => toggleItemCheck(list.id, item.id);
            
            const nameSpan = document.createElement('span');
            // 요구사항 17: 체크 시 글자색 연해지고 취소선 추가
            nameSpan.className = `item-name ${item.checked ? 'checked' : ''}`;
            nameSpan.textContent = item.name;
            nameSpan.title = '클릭하여 이름 수정';
            nameSpan.onclick = () => editItemName(list.id, item.id);
            
            left.appendChild(checkSpan);
            left.appendChild(nameSpan);
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-item-btn';
            deleteBtn.innerHTML = '✖';
            deleteBtn.onclick = () => deleteItem(list.id, item.id);
            
            li.appendChild(left);
            li.appendChild(deleteBtn);
            ul.appendChild(li);
        });
        
        // --- 4) 외출하기(점검 완료) 버튼 (요구사항 24) ---
        const checkoutBtn = document.createElement('button');
        checkoutBtn.className = 'checkout-btn';
        checkoutBtn.textContent = '외출하기 (점검 완료)';
        checkoutBtn.onclick = () => checkoutList(list);
        
        card.appendChild(header);
        card.appendChild(adder);
        card.appendChild(ul);
        card.appendChild(checkoutBtn);
        
        DOM.listsContainer.appendChild(card);
    });
}

// 자주 깜빡하는 물건 통계 렌더링 (요구사항 26, 27)
function renderDashboard() {
    DOM.forgottenList.innerHTML = '';
    
    // 객체를 배열로 변환
    const statsArray = Object.keys(state.forgottenStats).map(name => {
        return { name: name, count: state.forgottenStats[name] };
    });
    
    // 횟수가 많은 순으로 내림차순 정렬
    statsArray.sort((a, b) => b.count - a.count);
    
    if (statsArray.length === 0) {
        const li = document.createElement('li');
        li.textContent = '아직 깜빡한 물건이 없습니다. 훌륭해요! 👍';
        li.className = 'empty-msg';
        DOM.forgottenList.appendChild(li);
        return;
    }

    // 1위 : 충전기 형태로 렌더링 (요구사항 27)
    statsArray.forEach((stat, index) => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${index + 1}위 : ${stat.name}</strong> <span class="badge">${stat.count}회</span>`;
        DOM.forgottenList.appendChild(li);
    });
}

// 앱 진입 시 초기 데이터 로드
loadState();
