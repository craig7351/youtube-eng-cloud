let player;
let subtitles = [];
let currentSubtitleIndex = 0;
let autoScrollEnabled = true;
let timeOffset = 0; // 時間偏移量（秒），用於調整同步
let wordHighlightEnabled = true; // 單字高亮功能開關
let currentHighlightedWordIndex = -1; // 當前高亮的單字索引，用於避免閃爍
let playbackSpeed = 1; // 播放速度
let subtitleFontSize = 'medium'; // 字幕字體大小：small, medium, large
let containerWidth = '1400'; // 容器寬度：1200, 1400, 1600, 1800, 100

// 暱稱系統
let currentNickname = null;

// YouTube IFrame API 載入完成
function onYouTubeIframeAPIReady() {
    console.log('[DEBUG] YouTube IFrame API 已載入');
    console.log('[DEBUG] YT 對象:', typeof YT !== 'undefined' ? '存在' : '不存在');
    console.log('[DEBUG] YT.Player:', typeof YT !== 'undefined' && YT.Player ? '存在' : '不存在');
}

// 載入影片
document.getElementById('loadVideo').addEventListener('click', async () => {
    console.log('[DEBUG] 載入影片按鈕被點擊');

    const url = document.getElementById('youtubeUrl').value.trim();
    console.log('[DEBUG] 輸入的 URL:', url);

    if (!url) {
        console.log('[DEBUG] URL 為空');
        showError('請輸入 YouTube 網址');
        return;
    }

    // 記錄學習開始時間
    const nickname = getCurrentNickname();
    if (nickname) {
        startLearningSession(nickname);
    }

    const videoId = extractVideoId(url);
    console.log('[DEBUG] 提取的影片 ID:', videoId);
    
    if (!videoId) {
        console.log('[DEBUG] 無法提取影片 ID');
        showError('無效的 YouTube 網址');
        return;
    }

    try {
        console.log('[DEBUG] 開始載入影片，影片 ID:', videoId);
        showError('');
        
        // 清除舊的字幕和狀態
        subtitles = [];
        currentSubtitleIndex = 0;
        timeOffset = 0;
        updateOffsetDisplay();
        
        // 清除字幕顯示區域
        const subtitlesDiv = document.getElementById('subtitles');
        if (subtitlesDiv) {
            subtitlesDiv.innerHTML = '<p class="placeholder">準備載入字幕...</p>';
            // 確保行數類被應用
            ensureSubtitleLinesClass();
        }
        
        // 清除任何正在進行的翻譯進度監聽
        if (window.translationProgressInterval) {
            clearInterval(window.translationProgressInterval);
            window.translationProgressInterval = null;
        }
        
        // 移除翻譯進度條（如果存在）
        const progressDiv = document.getElementById('translation-progress');
        if (progressDiv) {
            progressDiv.remove();
        }
        
        const videoSection = document.getElementById('videoSection');
        console.log('[DEBUG] videoSection 元素:', videoSection);
        
        if (!videoSection) {
            console.error('[DEBUG] 找不到 videoSection 元素！');
            showError('找不到影片區域元素');
            return;
        }
        
        videoSection.style.display = 'grid';
        console.log('[DEBUG] 已顯示 videoSection');
        
        // 確保布局按鈕事件監聽器已設置
        setupLayoutButtons();

        // 確保字幕行數按鈕事件監聽器已設置
        setupSubtitleLinesButtons();

        // 確保播放速度和字體大小按鈕事件監聽器已設置
        setupPlaybackAndFontSizeButtons();

        // 確保字幕控制項（時間偏移、影片大小）事件監聽器已設置
        setupSubtitleControls();

        // 應用保存的設置（影片大小、字幕行數和布局）
        loadSavedSettings();
        
        const playerDiv = document.getElementById('player');
        console.log('[DEBUG] player div 元素:', playerDiv);
        
        if (!playerDiv) {
            console.error('[DEBUG] 找不到 player div 元素！');
            showError('找不到播放器元素');
            return;
        }
        
        // 先初始化 YouTube 播放器（不等待字幕）
        console.log('[DEBUG] 檢查現有播放器:', player);
        if (player) {
            console.log('[DEBUG] 銷毀現有播放器');
            player.destroy();
        }
        
        console.log('[DEBUG] 檢查 YT 對象:', typeof YT);
        if (typeof YT === 'undefined' || !YT.Player) {
            console.error('[DEBUG] YouTube IFrame API 尚未載入！');
            showError('YouTube API 尚未載入，請稍候再試');
            return;
        }
        
        console.log('[DEBUG] 開始創建新的 YouTube 播放器，影片 ID:', videoId);
        player = new YT.Player('player', {
            videoId: videoId,
            playerVars: {
                'playsinline': 1,
                'rel': 0,
                'modestbranding': 1
            },
            events: {
                'onReady': onPlayerReady,
                'onStateChange': onPlayerStateChange
            }
        });
        console.log('[DEBUG] YouTube 播放器創建完成:', player);
        
        // 異步載入字幕（不阻塞影片播放）
        console.log('[DEBUG] 開始異步載入字幕...');
        loadSubtitles(videoId).catch(error => {
            console.error('[DEBUG] 字幕載入失敗（不影響影片播放）:', error);
            const subtitlesDiv = document.getElementById('subtitles');
            if (subtitlesDiv) {
                subtitlesDiv.innerHTML = `<p class="placeholder" style="color: #f90;">字幕載入失敗：${error.message}，但影片可以正常播放</p>`;
            }
        });
    } catch (error) {
        console.error('[DEBUG] 載入影片時發生錯誤:', error);
        console.error('[DEBUG] 錯誤堆疊:', error.stack);
        showError('載入失敗：' + error.message);
    }
});

// 從 URL 提取影片 ID
function extractVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
        /youtube\.com\/watch\?.*v=([^&\n?#]+)/
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

// 載入字幕（異步，不阻塞影片播放）
async function loadSubtitles(videoId) {
    console.log('[DEBUG] loadSubtitles 被調用，videoId:', videoId);
    
    const subtitlesDiv = document.getElementById('subtitles');
    if (!subtitlesDiv) {
        console.error('[DEBUG] 找不到 subtitles div 元素！');
        // 不拋出錯誤，因為影片已經可以播放了
        return;
    }
    
    subtitlesDiv.innerHTML = '<p class="placeholder">載入字幕中...（影片可以先播放）</p>';
    // 確保行數類被應用
    ensureSubtitleLinesClass();
    
    try {
        const apiUrl = `/api/subtitles/${videoId}`;
        console.log('[DEBUG] 請求字幕 API:', apiUrl);
        console.log('[DEBUG] 開始時間:', new Date().toISOString());
        
        // 添加超時處理
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error('請求超時（超過 60 秒）'));
            }, 60000); // 60 秒超時
        });
        
        // 更新進度顯示
        const progressInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            subtitlesDiv.innerHTML = `<p class="placeholder">載入字幕中... (已等待 ${elapsed} 秒)</p>`;
        }, 1000);
        
        const startTime = Date.now();
        
        try {
            const fetchPromise = fetch(apiUrl);
            const response = await Promise.race([fetchPromise, timeoutPromise]);
            
            clearInterval(progressInterval);
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            console.log('[DEBUG] API 回應狀態:', response.status, response.statusText, `(耗時 ${elapsed} 秒)`);
            
            if (!response.ok) {
                const error = await response.json();
                console.error('[DEBUG] API 錯誤:', error);
                throw new Error(error.error || '無法載入字幕');
            }
            
            console.log('[DEBUG] 開始解析 JSON 回應...');
            const data = await response.json();
            console.log('[DEBUG] 收到字幕數據，字幕數量:', data.subtitles ? data.subtitles.length : 0);
            
            subtitles = data.subtitles || [];
            currentSubtitleIndex = 0;
            
            if (subtitles.length === 0) {
                console.log('[DEBUG] 沒有字幕數據');
                subtitlesDiv.innerHTML = '<p class="placeholder">此影片沒有可用的字幕</p>';
                return;
            }
            
            console.log('[DEBUG] 字幕載入成功，共', subtitles.length, '條');
            
            // 檢查是否需要翻譯
            if (data.needs_translation && data.translation_progress_key) {
                console.log('[DEBUG] 需要翻譯，開始監聽翻譯進度...');
                startTranslationProgress(data.translation_progress_key, data.has_chinese, data.total);
            } else {
                // 重置時間偏移
                timeOffset = 0;
                updateOffsetDisplay();
                renderSubtitles();
                console.log('[DEBUG] 字幕渲染完成');
            }
        } catch (timeoutError) {
            clearInterval(progressInterval);
            throw timeoutError;
        }
    } catch (error) {
        console.error('[DEBUG] 載入字幕時發生錯誤:', error);
        console.error('[DEBUG] 錯誤堆疊:', error.stack);
        console.error('[DEBUG] 錯誤類型:', error.name);
        console.error('[DEBUG] 錯誤訊息:', error.message);
        
        let errorMsg = error.message;
        if (error.message.includes('超時')) {
            errorMsg = '字幕載入超時，請檢查網路連線或稍後再試';
        } else if (error.message.includes('Failed to fetch')) {
            errorMsg = '無法連接到伺服器，請確認伺服器是否正常運行';
        }
        
        subtitlesDiv.innerHTML = `<p class="placeholder" style="color: #c33;">錯誤：${errorMsg}</p>`;
        throw error;
    }
}

// 開始監聽翻譯進度
function startTranslationProgress(progressKey, hasChinese, total) {
    const subtitlesDiv = document.getElementById('subtitles');
    
    // 先渲染現有的字幕（可能只有英文）
    timeOffset = 0;
    updateOffsetDisplay();
    renderSubtitles();
    
    // 顯示翻譯進度條
    const progressHtml = `
        <div id="translation-progress" style="background: #f0f0f0; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 2px solid #4a90e2;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <div style="font-weight: bold; color: #4a90e2;">正在翻譯中文字幕...</div>
                <div id="translation-percent" style="font-weight: bold; color: #4a90e2;">0%</div>
            </div>
            <div style="background: #ddd; border-radius: 4px; height: 24px; overflow: hidden;">
                <div id="translation-progress-bar" style="background: linear-gradient(90deg, #4a90e2, #5ba0f2); height: 100%; width: 0%; transition: width 0.3s ease; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: bold;"></div>
            </div>
            <div id="translation-status" style="margin-top: 8px; font-size: 14px; color: #666;">
                已翻譯: <span id="translation-current">0</span> / <span id="translation-total">${total}</span> 條
                <span id="translation-time" style="margin-left: 15px;">預計剩餘時間: 計算中...</span>
            </div>
        </div>
    `;
    
    // 在字幕容器頂部插入進度條
    const existingContent = subtitlesDiv.innerHTML;
    subtitlesDiv.innerHTML = progressHtml + existingContent;
    
    // 清除之前的翻譯進度監聽（如果存在）
    if (window.translationProgressInterval) {
        clearInterval(window.translationProgressInterval);
    }
    
    // 開始輪詢進度
    let startTime = Date.now();
    let lastTranslated = 0;
    let lastIndex = 0; // 追蹤已接收的字幕索引
    
    window.translationProgressInterval = setInterval(async () => {
        try {
            const response = await fetch(`/api/translation-progress/${progressKey}?last_index=${lastIndex}`);
            if (!response.ok) {
                throw new Error('無法獲取翻譯進度');
            }
            
            const progress = await response.json();
            
            // 實時更新新翻譯的字幕
            if (progress.new_items && progress.new_items.length > 0) {
                console.log(`[DEBUG] 收到 ${progress.new_items.length} 條新翻譯的字幕`);
                
                // 更新字幕陣列
                for (const newItem of progress.new_items) {
                    // 找到對應的字幕並更新
                    const index = subtitles.findIndex(sub => 
                        Math.abs(sub.start - newItem.start) < 0.1 && 
                        sub.english === newItem.english
                    );
                    
                    if (index !== -1) {
                        subtitles[index].chinese = newItem.chinese;
                        console.log(`[DEBUG] 更新第 ${index} 條字幕的中文翻譯`);
                    }
                }
                
                // 立即重新渲染字幕（實時顯示）
                renderSubtitles();
                lastIndex = progress.last_index;
            }
            
            if (progress.completed) {
                clearInterval(window.translationProgressInterval);
                window.translationProgressInterval = null;
                
                // 確保所有字幕都已更新
                console.log('[DEBUG] 翻譯完成，最終更新字幕...');
                renderSubtitles();
                
                // 移除進度條
                setTimeout(() => {
                    const progressDiv = document.getElementById('translation-progress');
                    if (progressDiv) {
                        progressDiv.remove();
                        renderSubtitles(); // 重新渲染，移除進度條
                    }
                }, 1000); // 1秒後移除進度條
                
                console.log('[DEBUG] 字幕更新完成');
                return;
            }
            
            // 更新進度條
            const percent = Math.round((progress.current / progress.total) * 100);
            const progressBar = document.getElementById('translation-progress-bar');
            const percentDiv = document.getElementById('translation-percent');
            const currentDiv = document.getElementById('translation-current');
            const totalDiv = document.getElementById('translation-total');
            const timeDiv = document.getElementById('translation-time');
            
            if (progressBar) progressBar.style.width = percent + '%';
            if (percentDiv) percentDiv.textContent = percent + '%';
            if (currentDiv) currentDiv.textContent = progress.current;
            if (totalDiv) totalDiv.textContent = progress.total;
            
            // 計算預計剩餘時間
            if (progress.translated > 0 && progress.translated !== lastTranslated) {
                const elapsed = (Date.now() - startTime) / 1000;
                const avgTimePerItem = elapsed / progress.translated;
                const remaining = Math.ceil((progress.total - progress.current) * avgTimePerItem);
                
                if (timeDiv) {
                    if (remaining < 60) {
                        timeDiv.textContent = `預計剩餘時間: ${remaining} 秒`;
                    } else {
                        const minutes = Math.floor(remaining / 60);
                        const seconds = remaining % 60;
                        timeDiv.textContent = `預計剩餘時間: ${minutes} 分 ${seconds} 秒`;
                    }
                }
                
                lastTranslated = progress.translated;
            }
            
        } catch (error) {
            console.error('[DEBUG] 獲取翻譯進度失敗:', error);
            clearInterval(window.translationProgressInterval);
            window.translationProgressInterval = null;
        }
    }, 300); // 每 0.3 秒更新一次，更快響應
}

// 更新翻譯後的字幕
async function updateTranslatedSubtitles(progressKey) {
    try {
        // 重新獲取字幕（此時翻譯應該已經完成）
        const videoId = extractVideoId(document.getElementById('youtubeUrl').value);
        const response = await fetch(`/api/subtitles/${videoId}`);
        if (!response.ok) {
            throw new Error('無法更新字幕');
        }
        
        const data = await response.json();
        subtitles = data.subtitles || [];
        console.log('[DEBUG] 字幕更新成功，共', subtitles.length, '條');
    } catch (error) {
        console.error('[DEBUG] 更新字幕失敗:', error);
        // 即使更新失敗，也繼續使用現有字幕
    }
}

// 將英文單字和片語變成可點擊
function makeWordsClickable(text) {
    if (!text) return text;

    // 移除音樂符號和其他符號，保留字母、數字、連字號、撇號
    const cleanText = text.replace(/[^\w\s'-]/g, ' ');

    // 匹配單字（字母、連字號、撇號）
    const wordPattern = /[a-zA-Z]+(?:[-'][a-zA-Z]+)*/g;
    const words = cleanText.match(wordPattern) || [];

    let result = text;
    const processedWords = new Set();

    // 處理每個單字
    words.forEach(word => {
        const lowerWord = word.toLowerCase();
        // 跳過太短的單字（少於3個字母）和常見的短詞，但對歌詞更寬鬆
        if (word.length < 3 || ['the', 'and', 'but', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'has', 'let', 'put', 'say', 'she', 'too', 'use'].includes(lowerWord)) {
            return;
        }

        // 對於歌詞，允許更多單字可以點擊
        const songWords = ['love', 'know', 'give', 'never', 'down', 'tell', 'make', 'gonna', 'gonna', 'run', 'around', 'desert', 'cry', 'goodbye', 'lie', 'hurt', 'up', 'let', 'think', 'feeling', 'understand', 'blind', 'heart', 'shy', 'inside', 'game', 'play', 'ask', 'how', 'commitment', 'thinking', 'guy', 'wanna', 'rules', 'strangers'];
        if (!songWords.includes(lowerWord) && word.length < 4) {
            return;
        }

        // 避免重複處理同一個單字
        if (processedWords.has(word)) {
            return;
        }
        processedWords.add(word);

        // 使用正則表達式替換，保持大小寫（忽略音樂符號）
        const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        result = result.replace(regex, `<span class="clickable-word" data-word="${word}">${word}</span>`);
    });

    return result;
}

// 渲染字幕
function renderSubtitles() {
    const container = document.getElementById('subtitles');
    const showEnglish = document.getElementById('showEnglish').checked;
    const showChinese = document.getElementById('showChinese').checked;
    
    // 如果進度條存在，保留它
    const progressDiv = document.getElementById('translation-progress');
    const progressHtml = progressDiv ? progressDiv.outerHTML : '';
    
    const subtitlesHtml = subtitles.map((sub, index) => {
        const timeStr = formatTime(sub.start);
        const englishHtml = showEnglish && sub.english ? makeWordsClickable(sub.english) : '';
        return `
            <div class="subtitle-item" data-index="${index}" data-start="${sub.start}">
                <div class="subtitle-time">${timeStr}</div>
                ${englishHtml ? `<div class="subtitle-english">${englishHtml}</div>` : ''}
                ${showChinese ? `<div class="subtitle-chinese">${sub.chinese || ''}</div>` : ''}
            </div>
        `;
    }).join('');
    
    container.innerHTML = progressHtml + subtitlesHtml;
    
    // 確保行數類被正確應用（因為innerHTML會清除類）
    ensureSubtitleLinesClass();
    
    // 綁定單字點擊事件
    bindWordClickEvents();
}

// 綁定單字點擊事件
function bindWordClickEvents() {
    const clickableWords = document.querySelectorAll('.clickable-word');
    clickableWords.forEach(wordEl => {
        wordEl.addEventListener('click', (e) => {
            e.stopPropagation(); // 防止觸發字幕項目的點擊事件
            const word = wordEl.dataset.word;
            showWordInfo(word);
        });
    });
}

// 顯示單字資訊
// showAddToBank: true 表示從字幕點擊，顯示「加入單字庫」選項；false 表示從單字庫點擊，不顯示
async function showWordInfo(word, wordInfo = null, showAddToBank = true) {
    const modal = document.getElementById('wordModal');
    const modalTitle = document.getElementById('wordModalTitle');
    const modalBody = document.getElementById('wordModalBody');
    const modalFooter = document.getElementById('wordModalFooter');

    // 顯示 modal
    modal.style.display = 'flex';
    modalTitle.textContent = word;

    // 初始化footer為隱藏
    modalFooter.style.display = 'none';

    // 顯示載入進度條
    modalBody.innerHTML = `
        <div class="word-loading-section">
            <div class="loading-spinner"></div>
            <div class="loading-text">正在查詢單字資訊...</div>
            <div class="loading-progress">
                <div class="progress-bar">
                    <div class="progress-fill" id="wordLoadingProgress"></div>
                </div>
                <div class="progress-text" id="wordLoadingText">0%</div>
            </div>
        </div>
    `;

    // 模擬進度條動畫
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress > 90) progress = 90; // 最多到90%，等實際載入完成

        const progressFill = document.getElementById('wordLoadingProgress');
        const progressText = document.getElementById('wordLoadingText');
        if (progressFill && progressText) {
            progressFill.style.width = `${progress}%`;
            progressText.textContent = `${Math.round(progress)}%`;
        }
    }, 200);

    try {
        // 如果提供了單字資訊，直接使用
        if (wordInfo && wordInfo.word) {
            clearInterval(progressInterval);
            // 設置進度條為100%
            const progressFill = document.getElementById('wordLoadingProgress');
            const progressText = document.getElementById('wordLoadingText');
            if (progressFill && progressText) {
                progressFill.style.width = '100%';
                progressText.textContent = '100%';
            }
            setTimeout(() => displayWordInfo(wordInfo, showAddToBank), 300);
            return;
        }

        // 否則從 API 獲取（從字幕點擊，顯示「加入單字庫」選項）
        // 使用 encodeURIComponent 來正確處理包含空格的片語
        const encodedWord = encodeURIComponent(word).replace(/%20/g, '+');
        const response = await fetch(`/api/word/${encodedWord}`);
        if (!response.ok) {
            throw new Error('無法獲取單字資訊');
        }

        const data = await response.json();

        // 完成進度條
        clearInterval(progressInterval);
        const progressFill = document.getElementById('wordLoadingProgress');
        const progressText = document.getElementById('wordLoadingText');
        if (progressFill && progressText) {
            progressFill.style.width = '100%';
            progressText.textContent = '100%';
        }

        // 延遲一下顯示結果，讓用戶看到進度條完成
        setTimeout(() => displayWordInfo(data, showAddToBank), 300);

    } catch (error) {
        clearInterval(progressInterval);
        console.error('[DEBUG] 獲取單字資訊失敗:', error);
        modalBody.innerHTML = `
            <div class="word-info-section">
                <p style="color: #c33;">無法載入單字資訊，請稍後再試。</p>
                <p style="color: #666; font-size: 14px;">錯誤：${error.message}</p>
            </div>
        `;
    }
}

// 播放單字發音（使用後端 TTS API，更自然的發音）
function playWordPronunciation(word, phonetic) {
    // 清理單字，移除特殊字符但保留連字號和撇號
    const cleanWord = word.trim().replace(/[^\w\s'-]/g, '');
    if (!cleanWord) return;
    
    // 使用後端 TTS API（通過後端代理 Google TTS，避免 CORS 問題）
    try {
        // 停止當前播放
        if (window.currentAudio) {
            window.currentAudio.pause();
            window.currentAudio = null;
        }
        
        // 使用後端 TTS API
        const ttsUrl = `/api/tts/${encodeURIComponent(cleanWord)}`;
        const audio = new Audio(ttsUrl);
        
        // 保存當前音頻對象，以便可以停止
        window.currentAudio = audio;
        
        audio.play().catch(error => {
            console.error('[DEBUG] 播放發音失敗:', error);
            // 如果後端 TTS 失敗，回退到瀏覽器語音合成
            fallbackToSpeechSynthesis(cleanWord);
        });
        
        // 播放完成後清理
        audio.onended = () => {
            window.currentAudio = null;
        };
        
        audio.onerror = () => {
            console.warn('[DEBUG] TTS API 失敗，使用瀏覽器語音合成');
            fallbackToSpeechSynthesis(cleanWord);
        };
    } catch (error) {
        console.error('[DEBUG] 發音錯誤:', error);
        fallbackToSpeechSynthesis(cleanWord);
    }
}

// 播放例句發音（使用後端 TTS API）
function playExamplePronunciation(text) {
    // 清理文本，移除引號但保留標點符號
    const cleanText = text.trim().replace(/^["']|["']$/g, '').replace(/[^\w\s.,!?'-]/g, '');
    if (!cleanText) return;
    
    try {
        // 停止當前播放
        if (window.currentAudio) {
            window.currentAudio.pause();
            window.currentAudio = null;
        }
        
        // 使用後端 TTS API
        const ttsUrl = `/api/tts/${encodeURIComponent(cleanText)}`;
        const audio = new Audio(ttsUrl);
        
        // 保存當前音頻對象
        window.currentAudio = audio;
        
        audio.play().catch(error => {
            console.error('[DEBUG] 播放例句發音失敗:', error);
            fallbackToSpeechSynthesis(cleanText);
        });
        
        // 播放完成後清理
        audio.onended = () => {
            window.currentAudio = null;
        };
        
        audio.onerror = () => {
            console.warn('[DEBUG] TTS API 失敗，使用瀏覽器語音合成');
            fallbackToSpeechSynthesis(cleanText);
        };
    } catch (error) {
        console.error('[DEBUG] 例句發音錯誤:', error);
        fallbackToSpeechSynthesis(cleanText);
    }
}

// 回退到瀏覽器語音合成（當 Google TTS 不可用時）
function fallbackToSpeechSynthesis(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 0.85;
        utterance.pitch = 1;
        utterance.volume = 1;
        // 嘗試使用更好的語音
        const voices = window.speechSynthesis.getVoices();
        const englishVoice = voices.find(voice => 
            voice.lang.startsWith('en') && (voice.name.includes('US') || voice.name.includes('American'))
        );
        if (englishVoice) {
            utterance.voice = englishVoice;
        }
        window.speechSynthesis.speak(utterance);
    }
}

// 顯示單字資訊內容
// showAddToBank: true 表示顯示「加入單字庫」選項；false 表示不顯示
function displayWordInfo(data, showAddToBank = true) {
    const modalBody = document.getElementById('wordModalBody');
    const modalFooter = document.getElementById('wordModalFooter');
    const word = data.word || '';
    const isPhrase = data.isPhrase || false;

    console.log('[調試] displayWordInfo 執行');
    console.log('[調試] 單字:', word);
    console.log('[調試] isPhrase:', isPhrase);
    console.log('[調試] showAddToBank:', showAddToBank);

    // 對於片語，不顯示加入單字庫的選項
    if (showAddToBank && !isPhrase) {
        console.log('[調試] 顯示單字庫選項');
        modalFooter.style.display = 'block';
        // 先顯示載入狀態
        modalFooter.innerHTML = `
            <div class="add-to-bank-section">
                <label>加入單字庫：</label>
                <div class="bank-loading">
                    <div class="bank-loading-spinner"></div>
                    <span>載入單字庫中...</span>
                </div>
            </div>
        `;
        // 異步載入單字庫列表
        console.log('[調試] 調用 loadBankSelectForModal');
        loadBankSelectForModal();
    } else {
        console.log('[調試] 隱藏單字庫選項');
        modalFooter.style.display = 'none';
    }

    // 對於片語，直接顯示翻譯結果
    if (isPhrase) {
        modalBody.innerHTML = `
            <div class="word-info-section">
                <div class="phrase-translation">
                    <h3>片語翻譯</h3>
                    <div class="translation-result">
                        <div class="original-text">"${word}"</div>
                        <div class="translated-text">${data.wordTranslation || '翻譯中...'}</div>
                    </div>
                    <button class="pronounce-btn" onclick="playWordPronunciation('${word.replace(/'/g, "\\'")}', '')" title="播放發音" style="margin-top: 10px;">🔊 播放片語發音</button>
                </div>
            </div>
        `;
        return;
    }

    if (!data.meanings || data.meanings.length === 0) {
        modalBody.innerHTML = `
            <div class="word-info-section">
                <p style="color: #999;">找不到此單字的資訊。</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    // 顯示單字的中文翻譯
    if (data.wordTranslation) {
        html += `<div class="word-translation" style="font-size: 20px; color: #764ba2; font-weight: bold; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #e9ecef;">`;
        html += `${data.wordTranslation}`;
        html += `</div>`;
    }
    
    // 顯示音標和發音按鈕
    if (data.phonetic) {
        html += `<div class="word-phonetic">`;
        html += `<span>/${data.phonetic}/</span>`;
        html += `<button class="pronounce-btn" onclick="playWordPronunciation('${word}', '${data.phonetic}')" title="播放發音">🔊</button>`;
        html += `</div>`;
    } else {
        // 即使沒有音標，也顯示發音按鈕
        html += `<div class="word-phonetic">`;
        html += `<button class="pronounce-btn" onclick="playWordPronunciation('${word}', '')" title="播放發音">🔊</button>`;
        html += `</div>`;
    }
    
    // 顯示每個詞性的定義
    data.meanings.forEach((meaning, index) => {
        html += `<div class="word-info-section">`;
        html += `<div class="meaning-part">`;
        html += `<div class="part-of-speech">${meaning.partOfSpeech || '未知詞性'}</div>`;
        
        // 顯示定義
        if (meaning.definitions && meaning.definitions.length > 0) {
            meaning.definitions.slice(0, 3).forEach((def, defIndex) => {
                html += `<div class="definition">`;
                html += `<div class="definition-en" style="display: flex; align-items: center; gap: 8px;">`;
                html += `<span>${defIndex + 1}. ${def.definition}</span>`;
                // 為定義添加發音按鈕
                const escapedDefinition = def.definition.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                html += `<button class="example-pronounce-btn" onclick="playExamplePronunciation('${escapedDefinition}')" title="播放定義發音">🔊</button>`;
                html += `</div>`;
                // 顯示定義的中文翻譯
                if (def.definitionZh) {
                    html += `<div class="definition-zh">${def.definitionZh}</div>`;
                } else if (def.definition) {
                    html += `<div class="definition-zh" style="color: #999; font-style: italic;">（翻譯中...）</div>`;
                }
                html += `</div>`;
                
                // 顯示例句（確保有中文翻譯）
                if (def.example) {
                    html += `<div class="example">`;
                    html += `<div class="example-header">`;
                    html += `<div class="example-en">"${def.example}"</div>`;
                    html += `<button class="example-pronounce-btn" onclick="playExamplePronunciation('${def.example.replace(/'/g, "\\'")}')" title="播放例句">🔊</button>`;
                    html += `</div>`;
                    // 確保顯示中文翻譯（如果沒有則顯示提示）
                    if (def.exampleZh) {
                        html += `<div class="example-zh">${def.exampleZh}</div>`;
                    } else {
                        html += `<div class="example-zh" style="color: #999; font-style: italic;">（翻譯中...）</div>`;
                    }
                    html += `</div>`;
                }
            });
        }
        
        html += `</div>`;
        
        // 顯示同義詞
        if (meaning.synonyms && meaning.synonyms.length > 0) {
            html += `<div class="word-synonyms">`;
            html += `<div class="synonyms-label">同義詞：</div>`;
            html += `<div class="synonyms-list">${meaning.synonyms.slice(0, 5).join(', ')}</div>`;
            html += `</div>`;
        }
        
        html += `</div>`;
    });
    
    modalBody.innerHTML = html;

    // 保存當前單字資訊，用於加入單字庫
    window.currentWordData = data;

    // 添加學習記錄
    if (isPhrase) {
        addLearningRecord('phrase_lookup', { phrase: word });
    } else {
        addLearningRecord('word_lookup', { word: word });
    }
}

// 關閉單字資訊 modal
function closeWordModal() {
    const modal = document.getElementById('wordModal');
    modal.style.display = 'none';
    
    // 如果之前單字庫內容 modal 是打開的，恢復它
    if (bankContentModalWasOpen) {
        const bankContentModal = document.getElementById('bankContentModal');
        if (bankContentModal) {
            bankContentModal.style.display = 'flex';
        }
        bankContentModalWasOpen = false;
    }
}

// 綁定 modal 關閉事件
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('wordModal');
    const closeBtn = document.getElementById('wordModalClose');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeWordModal);
    }
    
    // 點擊 modal 背景關閉
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeWordModal();
            }
        });
    }
    
    // ESC 鍵關閉
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === 'flex') {
            closeWordModal();
        }
    });
});

// 格式化時間
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// 播放器準備就緒
function onPlayerReady(event) {
    console.log('[DEBUG] 播放器準備就緒');
    console.log('[DEBUG] 播放器對象:', event.target);
    console.log('[DEBUG] 播放器狀態:', event.target.getPlayerState());

    // 設置播放速度
    if (event.target && typeof event.target.setPlaybackRate === 'function') {
        event.target.setPlaybackRate(playbackSpeed);
        console.log('[DEBUG] 設置播放速度為:', playbackSpeed);
    }

    // 記錄影片已成功載入
    const url = document.getElementById('youtubeUrl').value.trim();
    const videoId = extractVideoId(url);
    if (videoId) {
        currentLearningVideoId = videoId;
        console.log('[學習統計] 影片載入成功，videoId:', videoId);
    }

    // 開始監聽播放時間
    console.log('[DEBUG] 開始字幕同步監聽');
    setInterval(updateSubtitles, 100);
}

// 播放器狀態改變
function onPlayerStateChange(event) {
    console.log('[DEBUG] 播放器狀態改變:', event.data);
    const states = {
        0: 'UNSTARTED',
        1: 'ENDED',
        2: 'PLAYING',
        3: 'PAUSED',
        5: 'CUED'
    };
    console.log('[DEBUG] 狀態名稱:', states[event.data] || 'UNKNOWN');
    
    if (event.data === YT.PlayerState.PLAYING) {
        console.log('[DEBUG] 影片正在播放');
    }
}

// 更新字幕顯示
function updateSubtitles() {
    if (!player || subtitles.length === 0) return;
    
    try {
        const currentTime = player.getCurrentTime() + timeOffset;
        
        // 找到當前應該顯示的字幕
        let newIndex = -1;
        let bestMatch = null;
        let bestDistance = Infinity;
        
        // 尋找最接近的字幕
        for (let i = 0; i < subtitles.length; i++) {
            const sub = subtitles[i];
            const startTime = sub.start;
            const endTime = sub.end;
            
            // 如果當前時間在字幕時間範圍內
            if (currentTime >= startTime && currentTime < endTime) {
                newIndex = i;
                break;
            }
            
            // 計算距離字幕開始時間的距離
            const distanceToStart = Math.abs(currentTime - startTime);
            const distanceToEnd = Math.abs(currentTime - endTime);
            const minDistance = Math.min(distanceToStart, distanceToEnd);
            
            // 如果距離很近（0.5秒內），也考慮匹配
            if (minDistance < 0.5 && minDistance < bestDistance) {
                bestMatch = i;
                bestDistance = minDistance;
            }
        }
        
        // 如果沒有精確匹配，使用最佳匹配
        if (newIndex === -1 && bestMatch !== null) {
            newIndex = bestMatch;
        }
        
        // 如果時間超過最後一個字幕，顯示最後一個
        if (newIndex === -1 && subtitles.length > 0) {
            const lastSub = subtitles[subtitles.length - 1];
            if (currentTime >= lastSub.start) {
                newIndex = subtitles.length - 1;
            }
        }
        
        // 更新活動字幕
        if (newIndex !== currentSubtitleIndex) {
            // 移除舊的活動狀態和單字高亮
            const oldActive = document.querySelector('.subtitle-item.active');
            if (oldActive) {
                oldActive.classList.remove('active');
                // 移除所有單字高亮
                if (wordHighlightEnabled) {
                    oldActive.querySelectorAll('.clickable-word.highlight').forEach(word => {
                        word.classList.remove('highlight');
                    });
                }
            }
            
            // 重置高亮索引，因為切換到新的字幕
            currentHighlightedWordIndex = -1;
            
            // 添加新的活動狀態
            if (newIndex >= 0) {
                const newActive = document.querySelector(`[data-index="${newIndex}"]`);
                if (newActive) {
                    newActive.classList.add('active');
                    
                    // 自動滾動
                    if (autoScrollEnabled) {
                        newActive.scrollIntoView({
                            behavior: 'smooth',
                            block: 'center'
                        });
                    }
                }
            }
            
            currentSubtitleIndex = newIndex;
        }
        
        // 高亮當前應該發亮的單字（如果功能開啟）
        if (newIndex >= 0 && wordHighlightEnabled) {
            highlightCurrentWord(newIndex, currentTime);
        } else if (!wordHighlightEnabled) {
            // 如果功能關閉，移除所有高亮
            document.querySelectorAll('.clickable-word.highlight').forEach(word => {
                word.classList.remove('highlight');
            });
            currentHighlightedWordIndex = -1;
        }
    } catch (error) {
        // 忽略錯誤（可能是播放器尚未準備好）
    }
}

// 高亮當前應該發亮的單字
function highlightCurrentWord(subtitleIndex, currentTime) {
    if (subtitleIndex < 0 || subtitleIndex >= subtitles.length) return;

    const sub = subtitles[subtitleIndex];
    const startTime = sub.start;
    const endTime = sub.end;

    // 確保當前時間在字幕時間範圍內
    if (currentTime < startTime || currentTime >= endTime) {
        // 移除所有高亮
        const subtitleItem = document.querySelector(`[data-index="${subtitleIndex}"]`);
        if (subtitleItem) {
            subtitleItem.querySelectorAll('.clickable-word.highlight').forEach(word => {
                word.classList.remove('highlight');
            });
        }
        currentHighlightedWordIndex = -1;
        return;
    }

    const subtitleItem = document.querySelector(`[data-index="${subtitleIndex}"]`);
    if (!subtitleItem) return;

    const words = subtitleItem.querySelectorAll('.clickable-word');
    if (words.length === 0) return;

    // 改進的高亮算法：考慮單字長度和語速變化
    const duration = endTime - startTime;
    const elapsed = currentTime - startTime;
    const progress = Math.max(0, Math.min(1, elapsed / duration));

    // 計算每個單字的權重（基於單字長度）
    let totalWeight = 0;
    const wordWeights = [];
    words.forEach(word => {
        const text = word.textContent.trim();
        // 單字長度作為權重基礎，較長單字需要更多時間
        const weight = Math.max(1, text.length * 0.5); // 最少權重為1
        wordWeights.push(weight);
        totalWeight += weight;
    });

    // 找到當前進度對應的單字
    let cumulativeWeight = 0;
    let targetWordIndex = 0;

    for (let i = 0; i < wordWeights.length; i++) {
        cumulativeWeight += wordWeights[i];
        const cumulativeProgress = cumulativeWeight / totalWeight;

        // 添加緩衝區，避免過於頻繁的切換（至少停留0.3秒）
        const wordDuration = (wordWeights[i] / totalWeight) * duration;
        const bufferTime = Math.min(0.3, wordDuration * 0.2); // 最多0.3秒緩衝

        if (progress >= cumulativeProgress - (bufferTime / duration)) {
            targetWordIndex = i;
        } else {
            break;
        }
    }

    // 確保索引不超出範圍
    targetWordIndex = Math.min(targetWordIndex, words.length - 1);

    // 只在單字索引改變時才更新，避免閃爍
    // 使用字幕索引和單字索引的組合來追蹤當前高亮
    const currentSubtitleKey = `${subtitleIndex}-${targetWordIndex}`;
    const lastSubtitleKey = currentSubtitleIndex >= 0 && currentHighlightedWordIndex >= 0
        ? `${currentSubtitleIndex}-${currentHighlightedWordIndex}`
        : '';

    // 如果字幕項目改變，需要清除舊的高亮
    if (currentSubtitleIndex !== subtitleIndex && currentSubtitleIndex >= 0) {
        const oldSubtitleItem = document.querySelector(`[data-index="${currentSubtitleIndex}"]`);
        if (oldSubtitleItem) {
            oldSubtitleItem.querySelectorAll('.clickable-word.highlight').forEach(word => {
                word.classList.remove('highlight');
            });
        }
    }

    // 只在目標單字改變時才更新高亮，避免頻繁切換導致閃爍
    if (currentSubtitleKey !== lastSubtitleKey) {
        // 移除當前字幕項目中所有單字的高亮
        words.forEach(word => {
            word.classList.remove('highlight');
        });

        // 高亮當前單字
        if (words[targetWordIndex]) {
            words[targetWordIndex].classList.add('highlight');
        }

        currentHighlightedWordIndex = targetWordIndex;
    }
}

// 控制選項
document.getElementById('autoScroll').addEventListener('change', (e) => {
    autoScrollEnabled = e.target.checked;
});

document.getElementById('showEnglish').addEventListener('change', () => {
    renderSubtitles();
    updateSubtitles();
});

document.getElementById('showChinese').addEventListener('change', () => {
    renderSubtitles();
    updateSubtitles();
});

// 單字高亮開關
document.getElementById('wordHighlight').addEventListener('change', (e) => {
    wordHighlightEnabled = e.target.checked;
    localStorage.setItem('wordHighlight', wordHighlightEnabled.toString());

    if (!wordHighlightEnabled) {
        // 如果關閉，移除所有高亮
        document.querySelectorAll('.clickable-word.highlight').forEach(word => {
            word.classList.remove('highlight');
        });
        currentHighlightedWordIndex = -1;
    }
});

// 容器寬度控制
function setContainerWidth(width) {
    containerWidth = width;
    const container = document.querySelector('.container');
    if (container) {
        // 移除所有寬度類
        container.classList.remove('width-1200', 'width-1400', 'width-1600', 'width-1800', 'width-100');
        // 添加新的寬度類（用於CSS樣式）
        if (width === '100') {
            container.classList.add('width-100');
            container.style.maxWidth = '100%';
        } else {
            container.classList.add(`width-${width}`);
            container.style.maxWidth = `${width}px`;
        }
        localStorage.setItem('containerWidth', containerWidth);
        console.log('[容器寬度] 設置為:', width === '100' ? '100%' : `${width}px`);
    }
}

// 播放速度和字體大小控制
let playbackSpeedButtonsSetup = false;
let fontSizeButtonsSetup = false;
let containerWidthButtonsSetup = false;

function setupPlaybackAndFontSizeButtons() {
    // 設置容器寬度控制
    if (!containerWidthButtonsSetup) {
        const containerWidthSelect = document.getElementById('containerWidth');
        if (containerWidthSelect) {
            containerWidthSelect.addEventListener('change', (e) => {
                const newWidth = e.target.value;
                setContainerWidth(newWidth);
            });
            containerWidthButtonsSetup = true;
            console.log('[DEBUG] 容器寬度控制已設置');
        }
    }

    // 設置播放速度控制
    if (!playbackSpeedButtonsSetup) {
        const playbackSpeedSelect = document.getElementById('playbackSpeed');
        if (playbackSpeedSelect) {
            playbackSpeedSelect.addEventListener('change', (e) => {
                const newSpeed = parseFloat(e.target.value);
                playbackSpeed = newSpeed;
                localStorage.setItem('playbackSpeed', playbackSpeed.toString());

                // 如果播放器已準備好，立即應用新速度
                if (player && typeof player.setPlaybackRate === 'function') {
                    player.setPlaybackRate(playbackSpeed);
                    console.log('[播放速度] 設置為:', playbackSpeed);
                }
            });
            playbackSpeedButtonsSetup = true;
            console.log('[DEBUG] 播放速度控制已設置');
        }
    }

    // 設置字體大小下拉選單
    if (!fontSizeButtonsSetup) {
        const fontSizeSelect = document.getElementById('fontSizeSelect');
        if (fontSizeSelect) {
            fontSizeSelect.addEventListener('change', (e) => {
                subtitleFontSize = e.target.value;
                applySubtitleFontSize();
                localStorage.setItem('subtitleFontSize', subtitleFontSize);
            });
            fontSizeButtonsSetup = true;
            console.log('[DEBUG] 字體大小下拉選單已設置');
        }
    }

    // 如果有元素還沒設置好，稍後重試
    if (!playbackSpeedButtonsSetup || !fontSizeButtonsSetup) {
        setTimeout(setupPlaybackAndFontSizeButtons, 100);
    }
}

function applySubtitleFontSize() {
    const subtitlesContainer = document.getElementById('subtitles');
    if (!subtitlesContainer) return;

    // 移除之前的字體大小類
    subtitlesContainer.classList.remove('font-size-small', 'font-size-medium', 'font-size-large');

    // 添加新的字體大小類
    subtitlesContainer.classList.add(`font-size-${subtitleFontSize}`);
}

// 更新字體大小下拉選單的選中狀態
function updateFontSizeSelect() {
    const select = document.getElementById('fontSizeSelect');
    if (select) {
        select.value = subtitleFontSize;
    }
}

// 時間偏移和影片大小控制
let subtitleControlsSetup = false;

function setupSubtitleControls() {
    // 避免重複設置
    if (subtitleControlsSetup) {
        return;
    }

    // 設置影片大小下拉選單
    const videoSizeSelect = document.getElementById('videoSizeSelect');
    if (videoSizeSelect) {
        videoSizeSelect.addEventListener('change', (e) => {
            const size = e.target.value;
            setVideoSize(size);
        });
        console.log('[DEBUG] 影片大小下拉選單已設置');
    }

    // 使用事件委託，在字幕控制區域監聽點擊事件（用於時間偏移按鈕）
    const subtitleControls = document.querySelector('.subtitle-controls');
    if (subtitleControls) {
        subtitleControls.addEventListener('click', (e) => {
            const target = e.target;
            const clickedBtn = target.closest('button');
            if (clickedBtn) {
                const btnId = clickedBtn.id;
                console.log('[DEBUG] 點擊字幕控制按鈕:', btnId);

                // 處理時間偏移按鈕
                if (btnId === 'offsetMinus') {
                    e.preventDefault();
                    timeOffset -= 0.5;
                    updateOffsetDisplay();
                } else if (btnId === 'offsetPlus') {
                    e.preventDefault();
                    timeOffset += 0.5;
                    updateOffsetDisplay();
                } else if (btnId === 'offsetReset') {
                    e.preventDefault();
                    timeOffset = 0;
                    updateOffsetDisplay();
                }
            }
        });
        subtitleControlsSetup = true;
        console.log('[DEBUG] 字幕控制項事件委託已設置');
    } else {
        console.log('[DEBUG] 找不到 .subtitle-controls 元素，稍後重試');
        // 如果找不到元素，稍後重試
        setTimeout(setupSubtitleControls, 100);
    }
}

function updateOffsetDisplay() {
    const offsetValue = document.getElementById('offsetValue');
    if (offsetValue) {
        const sign = timeOffset >= 0 ? '+' : '';
        offsetValue.textContent = `${sign}${timeOffset.toFixed(1)}s`;
    }
    localStorage.setItem('timeOffset', timeOffset.toString());
}

// 影片大小控制
let currentVideoSize = 'medium'; // 'small', 'medium', 'large'

function setVideoSize(size) {
    currentVideoSize = size;
    const videoContainer = document.querySelector('.video-container');
    if (videoContainer) {
        // 移除所有尺寸類
        videoContainer.classList.remove('size-small', 'size-medium', 'size-large');
        // 添加新的尺寸類
        videoContainer.classList.add(`size-${size}`);
        
        // 更新下拉選單選中狀態
        const select = document.getElementById('videoSizeSelect');
        if (select) {
            select.value = size;
        }
        
        // 保存到 localStorage
        localStorage.setItem('videoSize', size);
    }
}

// 字幕行數控制
let currentSubtitleLines = 'medium'; // 默認中（10行）
let subtitleLinesButtonsSetup = false;

// 行數映射：small=3行, medium=10行, large=15行
const subtitleLinesMap = {
    'small': 3,
    'medium': 10,
    'large': 15
};

function setupSubtitleLinesButtons() {
    // 避免重複設置
    if (subtitleLinesButtonsSetup) {
        return;
    }

    // 設置字幕行數下拉選單
    const subtitleLinesSelect = document.getElementById('subtitleLinesSelect');
    if (subtitleLinesSelect) {
        subtitleLinesSelect.addEventListener('change', (e) => {
            const size = e.target.value; // small, medium, large
            setSubtitleLines(size);
        });
        subtitleLinesButtonsSetup = true;
        console.log('[DEBUG] 字幕行數下拉選單已設置');
    } else {
        console.log('[DEBUG] 找不到字幕行數下拉選單，稍後重試');
        // 如果找不到元素，稍後重試
        setTimeout(setupSubtitleLinesButtons, 100);
    }
}

function ensureSubtitleLinesClass() {
    const subtitlesContent = document.getElementById('subtitles');
    if (subtitlesContent && currentSubtitleLines) {
        const actualLines = subtitleLinesMap[currentSubtitleLines] || 10;
        // 移除所有行數類
        subtitlesContent.classList.remove('lines-1', 'lines-3', 'lines-5', 'lines-10', 'lines-15');
        // 添加當前的行數類
        subtitlesContent.classList.add(`lines-${actualLines}`);
    }
}

function setSubtitleLines(size) {
    currentSubtitleLines = size;
    const actualLines = subtitleLinesMap[size] || 10;
    const subtitlesContent = document.getElementById('subtitles');
    if (subtitlesContent) {
        // 移除所有行數類
        subtitlesContent.classList.remove('lines-1', 'lines-3', 'lines-5', 'lines-10', 'lines-15');
        // 添加新的行數類
        subtitlesContent.classList.add(`lines-${actualLines}`);
        
        // 更新下拉選單選中狀態
        const select = document.getElementById('subtitleLinesSelect');
        if (select) {
            select.value = size;
        }
        
        // 保存到 localStorage
        localStorage.setItem('subtitleLines', size);
    }
}

// 布局控制
let currentLayout = 'side-by-side'; // 'side-by-side' 或 'stacked'

// 使用事件委託設置布局按鈕事件監聽器
let layoutButtonsSetup = false;
function setupLayoutButtons() {
    // 避免重複設置
    if (layoutButtonsSetup) {
        return;
    }
    
    // 設置布局下拉選單
    const layoutSelect = document.getElementById('layoutSelect');
    if (layoutSelect) {
        layoutSelect.addEventListener('change', (e) => {
            const layout = e.target.value;
            setLayout(layout);
        });
        layoutButtonsSetup = true;
        console.log('[DEBUG] 布局下拉選單已設置');
    } else {
        console.warn('[DEBUG] 找不到布局下拉選單，稍後重試');
        // 如果元素還不存在，稍後再試
        setTimeout(setupLayoutButtons, 100);
    }
}

function setLayout(layout) {
    console.log('[DEBUG] setLayout 被調用，layout:', layout);
    currentLayout = layout;
    const videoSection = document.querySelector('.video-section');
    if (videoSection) {
        // 移除所有布局類
        videoSection.classList.remove('layout-side-by-side', 'layout-stacked');
        // 添加新的布局類
        videoSection.classList.add(`layout-${layout}`);
        console.log('[DEBUG] 已設置布局類:', `layout-${layout}`);
        
        // 更新按鈕狀態
        document.querySelectorAll('.layout-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeBtnId = `layout${layout === 'side-by-side' ? 'SideBySide' : 'Stacked'}`;
        const activeBtn = document.getElementById(activeBtnId);
        if (activeBtn) {
            activeBtn.classList.add('active');
            console.log('[DEBUG] 已激活按鈕:', activeBtnId);
        } else {
            console.error('[DEBUG] 找不到按鈕:', activeBtnId);
        }
        
        // 保存到 localStorage
        localStorage.setItem('layout', layout);
        console.log('[DEBUG] 布局已保存到 localStorage:', layout);
    } else {
        console.error('[DEBUG] 找不到 videoSection 元素');
    }
}

// 自動檢測寬螢幕並建議使用左右布局
function checkScreenWidthAndSuggestLayout() {
    const videoSection = document.querySelector('.video-section');
    if (!videoSection || videoSection.style.display === 'none') {
        return;
    }
    
    const windowWidth = window.innerWidth;
    const savedLayout = localStorage.getItem('layout');
    
    // 如果視窗寬度大於 1024px 且沒有保存的布局設置，自動使用左右布局
    if (windowWidth > 1024 && !savedLayout) {
        setLayout('side-by-side');
    } else if (savedLayout && ['side-by-side', 'stacked'].includes(savedLayout)) {
        setLayout(savedLayout);
    }
}

// 監聽視窗大小變化
window.addEventListener('resize', () => {
    checkScreenWidthAndSuggestLayout();
});

// 載入保存的設置
function loadSavedSettings() {
    // 載入影片大小設置
    const savedVideoSize = localStorage.getItem('videoSize');
    if (savedVideoSize && ['small', 'medium', 'large'].includes(savedVideoSize)) {
        setVideoSize(savedVideoSize);
    }
    
    // 載入字幕行數設置
    const savedSubtitleLines = localStorage.getItem('subtitleLines');
    if (savedSubtitleLines) {
        // 檢查是否為舊格式（數字）
        if (['1', '3', '5', '10'].includes(savedSubtitleLines)) {
            // 舊格式：轉換為新格式
            const oldLines = parseInt(savedSubtitleLines);
            let newSize = 'medium'; // 默認中
            if (oldLines <= 3) {
                newSize = 'small';
            } else if (oldLines <= 5) {
                newSize = 'medium';
            } else {
                newSize = 'large';
            }
            setSubtitleLines(newSize);
        } else if (['small', 'medium', 'large'].includes(savedSubtitleLines)) {
            // 新格式：直接使用
            setSubtitleLines(savedSubtitleLines);
        } else {
            // 如果保存的值無效，使用默認值 medium（10行）
            setSubtitleLines('medium');
        }
    } else {
        // 如果沒有保存的設置，使用默認值 medium（10行）
        setSubtitleLines('medium');
    }
    
    // 載入字體大小設置
    const savedFontSize = localStorage.getItem('subtitleFontSize');
    if (savedFontSize && ['small', 'medium', 'large'].includes(savedFontSize)) {
        subtitleFontSize = savedFontSize;
        applySubtitleFontSize();
        updateFontSizeSelect();
    } else {
        // 如果沒有保存的設置，使用默認值 medium
        subtitleFontSize = 'medium';
        applySubtitleFontSize();
        updateFontSizeSelect();
    }
    
    // 載入布局設置
    const savedLayout = localStorage.getItem('layout');
    if (savedLayout && ['side-by-side', 'stacked'].includes(savedLayout)) {
        setLayout(savedLayout);
    } else {
        // 如果沒有保存的設置，根據視窗寬度自動選擇
        checkScreenWidthAndSuggestLayout();
    }
    
    // 載入單字高亮設置
    const savedWordHighlight = localStorage.getItem('wordHighlight');
    if (savedWordHighlight !== null) {
        wordHighlightEnabled = savedWordHighlight === 'true';
        const wordHighlightCheckbox = document.getElementById('wordHighlight');
        if (wordHighlightCheckbox) {
            wordHighlightCheckbox.checked = wordHighlightEnabled;
        }
    }

    // 載入容器寬度設置
    const savedContainerWidth = localStorage.getItem('containerWidth');
    if (savedContainerWidth && ['1200', '1400', '1600', '1800', '100'].includes(savedContainerWidth)) {
        containerWidth = savedContainerWidth;
        const containerWidthSelect = document.getElementById('containerWidth');
        if (containerWidthSelect) {
            containerWidthSelect.value = containerWidth;
        }
        setContainerWidth(containerWidth);
    } else {
        // 如果沒有保存的設置，使用默認值1400
        setContainerWidth('1400');
    }

    // 載入播放速度設置
    const savedPlaybackSpeed = localStorage.getItem('playbackSpeed');
    if (savedPlaybackSpeed !== null) {
        playbackSpeed = parseFloat(savedPlaybackSpeed);
        const playbackSpeedSelect = document.getElementById('playbackSpeed');
        if (playbackSpeedSelect) {
            playbackSpeedSelect.value = playbackSpeed.toString();
        }
    }
}

// 字幕控制面板摺疊/展開功能
function setupSubtitleControlsToggle() {
    const toggleBtn = document.getElementById('subtitleControlsToggle');
    const controls = document.getElementById('subtitleControls');
    
    if (!toggleBtn || !controls) {
        // 如果元素還沒準備好，稍後重試
        setTimeout(setupSubtitleControlsToggle, 100);
        return;
    }
    
    // 檢查是否為手機設備（寬度小於768px）
    const isMobile = window.innerWidth <= 768;
    
    // 手機上預設摺疊，桌面預設展開
    if (isMobile) {
        controls.classList.add('collapsed');
        controls.classList.remove('expanded');
        toggleBtn.classList.remove('active');
    } else {
        controls.classList.add('expanded');
        controls.classList.remove('collapsed');
        toggleBtn.classList.add('active');
    }
    
    // 點擊按鈕切換摺疊/展開狀態
    toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (controls.classList.contains('collapsed')) {
            // 展開
            controls.classList.remove('collapsed');
            controls.classList.add('expanded');
            toggleBtn.classList.add('active');
        } else {
            // 摺疊
            controls.classList.remove('expanded');
            controls.classList.add('collapsed');
            toggleBtn.classList.remove('active');
        }
    });
    
    // 監聽窗口大小變化，在手機/桌面切換時調整狀態
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const isMobileNow = window.innerWidth <= 768;
            if (isMobileNow && !controls.classList.contains('collapsed')) {
                // 切換到手機模式，如果當前是展開狀態，保持展開（讓用戶自己控制）
                // 或者可以自動摺疊：取消下面的註釋
                // controls.classList.remove('expanded');
                // controls.classList.add('collapsed');
                // toggleBtn.classList.remove('active');
            }
        }, 250);
    });
}

// 頁面載入時恢復設置
document.addEventListener('DOMContentLoaded', () => {
    setupLayoutButtons();
    setupSubtitleLinesButtons();
    setupPlaybackAndFontSizeButtons();
    setupSubtitleControls();
    setupSubtitleControlsToggle();
    loadSavedSettings();
});

// 點擊字幕跳轉到對應時間
document.addEventListener('click', (e) => {
    const subtitleItem = e.target.closest('.subtitle-item');
    if (subtitleItem && player) {
        const startTime = parseFloat(subtitleItem.dataset.start);
        player.seekTo(startTime, true);
        if (player.getPlayerState() !== YT.PlayerState.PLAYING) {
            player.playVideo();
        }
    }
});

// 顯示錯誤訊息
function showError(message) {
    const errorEl = document.getElementById('errorMessage');
    if (message) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    } else {
        errorEl.style.display = 'none';
    }
}

// Enter 鍵載入影片
document.getElementById('youtubeUrl').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('loadVideo').click();
    }
});

// ==================== 書籤功能 ====================

const BOOKMARKS_STORAGE_KEY = 'youtube_bookmarks';

// 載入書籤（從服務器）
async function loadBookmarks() {
    try {
        const nickname = getCurrentNickname();
        console.log('[DEBUG] 載入書籤，當前暱稱:', nickname);
        
        if (!nickname) {
            console.log('[DEBUG] 沒有暱稱，無法載入書籤');
            return [];
        }

        // 從服務器 API 獲取書籤
        const response = await fetch(`/api/bookmarks?nickname=${encodeURIComponent(nickname)}`);
        if (!response.ok) {
            if (response.status === 404) {
                console.log('[DEBUG] 服務器上沒有書籤數據');
                return [];
            }
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const bookmarks = data.bookmarks || [];
        console.log('[DEBUG] 從服務器載入書籤成功，數量:', bookmarks.length, '書籤:', bookmarks);
        
        // 嘗試從 localStorage 遷移舊書籤（如果服務器上沒有）
        if (bookmarks.length === 0) {
            const migratedBookmarks = migrateBookmarksFromLocalStorage(nickname);
            if (migratedBookmarks.length > 0) {
                console.log('[DEBUG] 從 localStorage 遷移書籤，數量:', migratedBookmarks.length);
                await saveBookmarks(migratedBookmarks);
                return migratedBookmarks;
            }
        }
        
        return Array.isArray(bookmarks) ? bookmarks : [];
    } catch (error) {
        console.error('[DEBUG] 載入書籤失敗:', error);
        // 如果 API 失敗，嘗試從 localStorage 載入（向後兼容）
        return loadBookmarksFromLocalStorage();
    }
}

// 從 localStorage 載入書籤（向後兼容）
function loadBookmarksFromLocalStorage() {
    try {
        const nickname = getCurrentNickname();
        if (!nickname) return [];

        const storageKey = `youtube_bookmarks_${nickname}`;
        const bookmarksJson = localStorage.getItem(storageKey);
        if (bookmarksJson) {
            const bookmarks = JSON.parse(bookmarksJson);
            console.log('[DEBUG] 從 localStorage 載入書籤，數量:', bookmarks.length);
            return Array.isArray(bookmarks) ? bookmarks : [];
        }
        
        // 檢查是否有其他可能的鍵（大小寫變體）
        const migratedData = checkAlternativeBookmarkKeys(nickname);
        if (migratedData) {
            const bookmarks = JSON.parse(migratedData);
            console.log('[DEBUG] 從替代鍵載入書籤成功，數量:', bookmarks.length);
            return Array.isArray(bookmarks) ? bookmarks : [];
        }
    } catch (error) {
        console.error('[DEBUG] 從 localStorage 載入書籤失敗:', error);
    }
    return [];
}

// 從 localStorage 遷移書籤到服務器
function migrateBookmarksFromLocalStorage(nickname) {
    try {
        const storageKey = `youtube_bookmarks_${nickname}`;
        const bookmarksJson = localStorage.getItem(storageKey);
        if (bookmarksJson) {
            const bookmarks = JSON.parse(bookmarksJson);
            // 遷移後清除 localStorage
            localStorage.removeItem(storageKey);
            console.log('[DEBUG] 已從 localStorage 遷移書籤到服務器');
            return Array.isArray(bookmarks) ? bookmarks : [];
        }
        
        // 檢查大小寫變體
        const migratedData = checkAlternativeBookmarkKeys(nickname);
        if (migratedData) {
            const bookmarks = JSON.parse(migratedData);
            return Array.isArray(bookmarks) ? bookmarks : [];
        }
    } catch (error) {
        console.error('[DEBUG] 遷移書籤失敗:', error);
    }
    return [];
}

// 檢查是否有其他可能的書籤鍵（用於處理大小寫問題）
function checkAlternativeBookmarkKeys(nickname) {
    // 檢查所有可能的鍵變體
    const variants = [
        nickname.toLowerCase(),
        nickname.toUpperCase(),
        nickname.charAt(0).toUpperCase() + nickname.slice(1).toLowerCase()
    ];
    
    // 移除重複項
    const uniqueVariants = [...new Set(variants)];
    
    for (const variant of uniqueVariants) {
        // 跳過與當前暱稱相同的變體（已經檢查過了）
        if (variant === nickname) continue;
        
        const key = `youtube_bookmarks_${variant}`;
        const data = localStorage.getItem(key);
        if (data) {
            console.log('[DEBUG] 找到替代書籤鍵:', key);
            // 遷移到當前暱稱的鍵
            localStorage.setItem(`youtube_bookmarks_${nickname}`, data);
            console.log('[DEBUG] 已將書籤遷移到當前暱稱鍵');
            return data; // 返回數據以便立即使用
        }
    }
    return null;
}

// 保存書籤（到服務器）
async function saveBookmarks(bookmarks) {
    try {
        const nickname = getCurrentNickname();
        if (!nickname) {
            console.error('[DEBUG] 沒有暱稱，無法保存書籤');
            return false;
        }

        // 保存到服務器
        const response = await fetch('/api/bookmarks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                nickname: nickname,
                bookmarks: bookmarks
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (data.success) {
            console.log('[DEBUG] 書籤已保存到服務器，數量:', bookmarks.length);
            return true;
        } else {
            throw new Error(data.error || '保存失敗');
        }
    } catch (error) {
        console.error('[DEBUG] 保存書籤到服務器失敗:', error);
        // 如果 API 失敗，嘗試保存到 localStorage（向後兼容）
        console.log('[DEBUG] 嘗試保存到 localStorage 作為備份');
        return saveBookmarksToLocalStorage(bookmarks);
    }
}

// 保存書籤到 localStorage（向後兼容）
function saveBookmarksToLocalStorage(bookmarks) {
    try {
        const nickname = getCurrentNickname();
        if (!nickname) return false;

        const storageKey = `youtube_bookmarks_${nickname}`;
        localStorage.setItem(storageKey, JSON.stringify(bookmarks));
        console.log('[DEBUG] 書籤已保存到 localStorage，數量:', bookmarks.length);
        return true;
    } catch (error) {
        console.error('[DEBUG] 保存書籤到 localStorage 失敗:', error);
        return false;
    }
}

// 渲染書籤列表
async function renderBookmarks() {
    const bookmarkList = document.getElementById('bookmarkList');
    if (!bookmarkList) {
        console.warn('[DEBUG] 找不到書籤列表元素');
        return false;
    }
    
    const bookmarks = await loadBookmarks();
    console.log('[DEBUG] 渲染書籤，數量:', bookmarks.length, '書籤數據:', bookmarks);
    
    if (bookmarks.length === 0) {
        bookmarkList.innerHTML = '<p class="placeholder">還沒有書籤</p>';
        console.log('[DEBUG] 書籤為空，顯示提示訊息');
        return true;
    }
    
    let html = '';
    bookmarks.forEach((bookmark, index) => {
        const videoId = extractVideoId(bookmark.url);
        const title = bookmark.title || bookmark.url;
        const displayTitle = title.length > 50 ? title.substring(0, 50) + '...' : title;
        // 更安全的轉義處理
        const escapedTitle = title.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ').replace(/\r/g, '');
        const escapedUrl = bookmark.url.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        
        html += `
            <div class="bookmark-item">
                <div class="bookmark-item-content" onclick="selectBookmark('${escapedUrl}')">
                    <div class="bookmark-title">${displayTitle}</div>
                    <div class="bookmark-url">${bookmark.url}</div>
                </div>
                <div class="bookmark-actions">
                    <button class="bookmark-edit-btn" onclick="editBookmark(${index}, '${escapedTitle}')" title="改名">✏️</button>
                    <button class="bookmark-delete-btn" onclick="deleteBookmark(${index})" title="刪除">×</button>
                </div>
            </div>
        `;
    });
    
    // 強制更新內容
    try {
        bookmarkList.innerHTML = html;
        console.log('[DEBUG] 書籤列表已渲染，HTML 長度:', html.length);
        console.log('[DEBUG] bookmarkList 元素:', bookmarkList);
        console.log('[DEBUG] bookmarkList.innerHTML 長度:', bookmarkList.innerHTML.length);
        
        // 驗證渲染結果
        const renderedItems = bookmarkList.querySelectorAll('.bookmark-item');
        console.log('[DEBUG] 渲染後的書籤項目數量:', renderedItems.length);
        
        if (renderedItems.length === 0 && bookmarks.length > 0) {
            console.error('[DEBUG] 警告：渲染後沒有找到書籤項目！');
            console.error('[DEBUG] HTML 內容:', html.substring(0, 500));
            console.error('[DEBUG] bookmarkList.innerHTML:', bookmarkList.innerHTML.substring(0, 500));
        }
        
        // 渲染完成後，如果下拉選單是打開的，調整高度
        setTimeout(() => {
            adjustInputSectionHeight();
        }, 10);
        
        return true;
    } catch (error) {
        console.error('[DEBUG] 渲染書籤時發生錯誤:', error);
        return false;
    }
}

// 添加書籤（支持命名）
async function addBookmark() {
    const urlInput = document.getElementById('youtubeUrl');
    const url = urlInput.value.trim();
    
    if (!url) {
        alert('請先輸入 YouTube 網址');
        return;
    }
    
    const videoId = extractVideoId(url);
    if (!videoId) {
        alert('無效的 YouTube 網址');
        return;
    }
    
    const bookmarks = await loadBookmarks();
    
    // 檢查是否已存在
    if (bookmarks.some(b => b.url === url)) {
        alert('此網址已經在書籤中');
        return;
    }
    
    // 詢問書籤名稱
    const defaultName = `影片 ${videoId}`;
    const bookmarkName = prompt('請輸入書籤名稱：', defaultName);
    
    if (bookmarkName === null) {
        // 用戶取消
        return;
    }
    
    const name = bookmarkName.trim() || defaultName;
    
    // 添加新書籤
    const bookmark = {
        url: url,
        title: name,
        addedAt: new Date().toISOString()
    };
    
    bookmarks.push(bookmark);
    
    if (await saveBookmarks(bookmarks)) {
        await renderBookmarks();
        alert('書籤已添加！');
    } else {
        alert('添加書籤失敗');
    }
}

// 選擇書籤
async function selectBookmark(url) {
    const urlInput = document.getElementById('youtubeUrl');
    urlInput.value = url;
    
    // 記錄書籤被觀看（如果是從書籤列表點擊的）
    try {
        await fetch('/api/bookmarks/record-view', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: url })
        });
    } catch (error) {
        console.error('[DEBUG] 記錄書籤觀看失敗:', error);
        // 即使記錄失敗，也繼續執行
    }
    
    // 關閉書籤下拉選單
    const dropdown = document.getElementById('bookmarkDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
    
    // 可選：自動載入影片
    // document.getElementById('loadVideo').click();
}

// 編輯書籤名稱
async function editBookmark(index, currentTitle) {
    const bookmarks = await loadBookmarks();
    
    if (index < 0 || index >= bookmarks.length) {
        alert('書籤不存在');
        return;
    }
    
    const bookmark = bookmarks[index];
    const newTitle = prompt('請輸入新的書籤名稱：', currentTitle);
    
    if (newTitle === null) {
        // 用戶取消
        return;
    }
    
    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) {
        alert('書籤名稱不能為空');
        return;
    }
    
    bookmark.title = trimmedTitle;
    bookmark.updatedAt = new Date().toISOString();
    
    if (await saveBookmarks(bookmarks)) {
        await renderBookmarks();
        alert('書籤名稱已更新！');
    } else {
        alert('更新書籤失敗');
    }
}

// 刪除書籤
async function deleteBookmark(index) {
    if (!confirm('確定要刪除此書籤嗎？')) {
        return;
    }
    
    const bookmarks = await loadBookmarks();
    if (index < 0 || index >= bookmarks.length) {
        alert('書籤不存在');
        return;
    }
    
    bookmarks.splice(index, 1);
    
    if (await saveBookmarks(bookmarks)) {
        await renderBookmarks();
    } else {
        alert('刪除書籤失敗');
    }
}

// 動態調整 input-section 的高度以適應書籤下拉選單
function adjustInputSectionHeight() {
    const dropdown = document.getElementById('bookmarkDropdown');
    const inputSection = document.querySelector('.input-section');
    
    if (!dropdown || !inputSection) {
        return;
    }
    
    // 檢查下拉選單是否可見（display 不是 'none'）
    const isVisible = dropdown.style.display !== 'none' && 
                      (dropdown.style.display === 'block' || dropdown.style.display === '');
    
    if (isVisible) {
        // 書籤下拉選單打開時，計算實際高度
        const bookmarkList = document.getElementById('bookmarkList');
        if (bookmarkList) {
            // 獲取書籤列表的實際高度，加上下拉選單的邊距和標題高度
            const listHeight = bookmarkList.scrollHeight;
            const headerHeight = dropdown.querySelector('.bookmark-header')?.offsetHeight || 0;
            const totalHeight = listHeight + headerHeight + 10; // 10px 是額外的邊距
            
            // 設置 padding-bottom，確保有足夠空間顯示下拉選單
            inputSection.style.paddingBottom = `${Math.max(totalHeight, 30)}px`;
        }
    } else {
        // 書籤下拉選單關閉時，恢復正常 padding
        inputSection.style.paddingBottom = '30px';
    }
}

// 書籤按鈕點擊事件（在 DOM 載入後註冊）
let bookmarkButtonSetup = false;
function setupBookmarkButton() {
    const bookmarkBtn = document.getElementById('bookmarkBtn');
    if (bookmarkBtn && !bookmarkButtonSetup) {
        bookmarkButtonSetup = true;
        
        bookmarkBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('[DEBUG] 書籤按鈕被點擊');
            const dropdown = document.getElementById('bookmarkDropdown');
            if (dropdown) {
                const isVisible = dropdown.style.display === 'block';
                
                if (!isVisible) {
                    // 打開下拉選單
                    console.log('[DEBUG] 打開書籤下拉選單，強制重新渲染書籤');
                    dropdown.style.display = 'block';
                    
                    // 立即渲染，然後驗證
                    (async () => {
                        const bookmarks = await loadBookmarks();
                        console.log('[DEBUG] 準備渲染，書籤數量:', bookmarks.length);
                        
                        // 強制重新渲染（確保元素可見後再渲染）
                        setTimeout(async () => {
                            const bookmarkList = document.getElementById('bookmarkList');
                            if (!bookmarkList) {
                                console.error('[DEBUG] 錯誤：找不到書籤列表元素！');
                                return;
                            }
                            
                            const success = await renderBookmarks();
                            console.log('[DEBUG] 渲染結果:', success);
                            
                            // 驗證渲染結果
                            const items = bookmarkList.querySelectorAll('.bookmark-item');
                            console.log('[DEBUG] 打開下拉選單後驗證 - 數據數量:', bookmarks.length, '渲染項目數:', items.length);
                            console.log('[DEBUG] bookmarkList.innerHTML 長度:', bookmarkList.innerHTML.length);
                            console.log('[DEBUG] bookmarkList.innerHTML 前500字符:', bookmarkList.innerHTML.substring(0, 500));
                            
                            if (items.length === 0 && bookmarks.length > 0) {
                                console.error('[DEBUG] 錯誤：有書籤數據但未渲染！強制重新渲染');
                                // 再次嘗試渲染
                                await renderBookmarks();
                            }
                            
                            // 渲染完成後調整高度
                            setTimeout(() => {
                                adjustInputSectionHeight();
                            }, 50);
                        }, 10);
                    })();
                } else {
                    // 關閉下拉選單
                    console.log('[DEBUG] 關閉書籤下拉選單');
                    dropdown.style.display = 'none';
                    // 關閉後調整高度
                    adjustInputSectionHeight();
                }
            }
        });
        console.log('[DEBUG] 書籤按鈕事件監聽器已註冊');
    } else if (!bookmarkBtn) {
        console.warn('[DEBUG] 找不到書籤按鈕，稍後重試');
        setTimeout(setupBookmarkButton, 100);
    }
}

// 設置書籤相關的事件監聽器
function setupBookmarkEventListeners() {
    // 添加書籤按鈕
    const addBookmarkBtn = document.getElementById('addBookmarkBtn');
    if (addBookmarkBtn) {
        addBookmarkBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            addBookmark();
        });
    }
    
    // 匯出書籤按鈕
    const exportBookmarksBtn = document.getElementById('exportBookmarksBtn');
    if (exportBookmarksBtn) {
        exportBookmarksBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportBookmarks();
        });
    }
    
    // 匯入書籤按鈕
    const importBookmarksBtn = document.getElementById('importBookmarksBtn');
    if (importBookmarksBtn) {
        importBookmarksBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const fileInput = document.getElementById('importBookmarkFileInput');
            if (fileInput) {
                fileInput.click();
            }
        });
    }
    
    // 處理書籤文件選擇
    const importBookmarkFileInput = document.getElementById('importBookmarkFileInput');
    if (importBookmarkFileInput) {
        importBookmarkFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) {
                return;
            }
            
            if (!file.name.endsWith('.json')) {
                alert('請選擇 JSON 格式的文件');
                e.target.value = '';
                return;
            }
            
            importBookmarks(file);
            e.target.value = '';
        });
    }
}

// 這些事件監聽器已經在 setupBookmarkEventListeners() 中註冊，無需重複

// 匯出書籤功能
async function exportBookmarks() {
    try {
        const bookmarks = await loadBookmarks();
        
        if (bookmarks.length === 0) {
            alert('沒有書籤可以匯出');
            return;
        }
        
        // 創建 JSON 數據
        const jsonData = JSON.stringify(bookmarks, null, 2);
        
        // 創建下載鏈接
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        a.href = url;
        a.download = `bookmarks_${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        alert('書籤匯出成功！');
    } catch (error) {
        console.error('[DEBUG] 匯出書籤失敗:', error);
        alert('匯出失敗：' + error.message);
    }
}

// 匯入書籤功能
async function importBookmarks(file) {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
        try {
            const importedBookmarks = JSON.parse(e.target.result);
            
            if (!Array.isArray(importedBookmarks)) {
                alert('無效的書籤格式');
                return;
            }
            
            // 驗證書籤格式
            const validBookmarks = importedBookmarks.filter(b => b.url && b.title);
            if (validBookmarks.length === 0) {
                alert('文件中沒有有效的書籤');
                return;
            }
            
            // 確認匯入
            if (!confirm(`確定要匯入 ${validBookmarks.length} 個書籤嗎？\n如果 URL 相同，會更新書籤名稱。`)) {
                return;
            }
            
            const existingBookmarks = await loadBookmarks();
            const urlMap = new Map();
            
            // 建立現有書籤的 URL 映射
            existingBookmarks.forEach(b => {
                urlMap.set(b.url, b);
            });
            
            // 合併書籤
            let importedCount = 0;
            let updatedCount = 0;
            
            validBookmarks.forEach(bookmark => {
                if (urlMap.has(bookmark.url)) {
                    // 更新現有書籤
                    const existing = urlMap.get(bookmark.url);
                    existing.title = bookmark.title;
                    if (bookmark.addedAt) {
                        existing.addedAt = bookmark.addedAt;
                    }
                    updatedCount++;
                } else {
                    // 添加新書籤
                    existingBookmarks.push({
                        url: bookmark.url,
                        title: bookmark.title,
                        addedAt: bookmark.addedAt || new Date().toISOString()
                    });
                    importedCount++;
                }
            });
            
            if (await saveBookmarks(existingBookmarks)) {
                await renderBookmarks();
                alert(`匯入成功！\n新增 ${importedCount} 個書籤\n更新 ${updatedCount} 個書籤`);
            } else {
                alert('保存書籤失敗');
            }
        } catch (error) {
            console.error('[DEBUG] 匯入書籤失敗:', error);
            alert('匯入失敗：' + error.message);
        }
    };
    
    reader.onerror = () => {
        alert('讀取文件失敗');
    };
    
    reader.readAsText(file);
}

// 點擊外部關閉書籤下拉選單
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('bookmarkDropdown');
    const bookmarkBtn = document.getElementById('bookmarkBtn');
    
    if (dropdown && bookmarkBtn) {
        if (!dropdown.contains(e.target) && !bookmarkBtn.contains(e.target)) {
            dropdown.style.display = 'none';
            // 關閉後調整高度
            adjustInputSectionHeight();
        }
    }
});

// 測試書籤功能（可在控制台手動調用）
window.testBookmarks = function() {
    console.log('========== 測試書籤功能 ==========');
    console.log('1. 檢查 localStorage:');
    const stored = localStorage.getItem(BOOKMARKS_STORAGE_KEY);
    console.log('   localStorage 內容:', stored);
    
    console.log('2. 檢查 loadBookmarks():');
    (async () => {
        const bookmarks = await loadBookmarks();
        console.log('   書籤數量:', bookmarks.length);
        console.log('   書籤數據:', bookmarks);
        
        console.log('3. 檢查 DOM 元素:');
        const bookmarkList = document.getElementById('bookmarkList');
        const bookmarkDropdown = document.getElementById('bookmarkDropdown');
        const bookmarkBtn = document.getElementById('bookmarkBtn');
        console.log('   bookmarkList:', bookmarkList);
        console.log('   bookmarkDropdown:', bookmarkDropdown);
        console.log('   bookmarkBtn:', bookmarkBtn);
        
        if (bookmarkList) {
            console.log('4. 檢查 bookmarkList 內容:');
            console.log('   innerHTML 長度:', bookmarkList.innerHTML.length);
            console.log('   innerHTML 內容:', bookmarkList.innerHTML);
            console.log('   子元素數量:', bookmarkList.children.length);
            console.log('   .bookmark-item 數量:', bookmarkList.querySelectorAll('.bookmark-item').length);
        }
        
        console.log('5. 嘗試手動渲染:');
        if (bookmarkList) {
            await renderBookmarks();
            console.log('   渲染後 innerHTML 長度:', bookmarkList.innerHTML.length);
            console.log('   渲染後 .bookmark-item 數量:', bookmarkList.querySelectorAll('.bookmark-item').length);
        }
    })();
    
    console.log('========== 測試完成 ==========');
};

// 頁面載入時渲染書籤
function initBookmarks() {
    console.log('[DEBUG] 初始化書籤，readyState:', document.readyState);
    const bookmarkList = document.getElementById('bookmarkList');
    const bookmarkDropdown = document.getElementById('bookmarkDropdown');
    
    if (bookmarkList && bookmarkDropdown) {
        console.log('[DEBUG] 找到書籤列表元素和下拉選單，開始渲染');
        console.log('[DEBUG] 下拉選單顯示狀態:', bookmarkDropdown.style.display);
        
        // 檢查是否有暱稱，如果沒有則等待
        const nickname = getCurrentNickname();
        if (!nickname) {
            console.log('[DEBUG] 還沒有暱稱，等待暱稱載入後再初始化書籤');
            // 等待暱稱載入（最多等待5秒）
            let retryCount = 0;
            const maxRetries = 50; // 50次 * 100ms = 5秒
            const checkNickname = setInterval(() => {
                retryCount++;
                const currentNickname = getCurrentNickname();
                if (currentNickname) {
                    console.log('[DEBUG] 暱稱已載入，現在初始化書籤');
                    clearInterval(checkNickname);
                    loadAndRenderBookmarks();
                } else if (retryCount >= maxRetries) {
                    console.log('[DEBUG] 等待暱稱超時，使用空書籤列表');
                    clearInterval(checkNickname);
                    bookmarkList.innerHTML = '<p class="placeholder">請先輸入暱稱</p>';
                }
            }, 100);
            return;
        }
        
        // 有暱稱，直接載入和渲染
        loadAndRenderBookmarks();
    } else {
        console.warn('[DEBUG] 找不到書籤元素，bookmarkList:', !!bookmarkList, 'bookmarkDropdown:', !!bookmarkDropdown);
        // 如果元素還沒準備好，稍後再試
        setTimeout(initBookmarks, 100);
    }
}

// 載入並渲染書籤
async function loadAndRenderBookmarks() {
    const bookmarkList = document.getElementById('bookmarkList');
    if (!bookmarkList) return;
    
    // 無論下拉選單是否顯示，都先渲染內容
    const bookmarks = await loadBookmarks();
    console.log('[DEBUG] 載入的書籤數量:', bookmarks.length);
    
    if (bookmarks.length > 0) {
        // 強制渲染
        await renderBookmarks();
        
        // 驗證渲染結果
        setTimeout(() => {
            const renderedItems = bookmarkList.querySelectorAll('.bookmark-item');
            console.log('[DEBUG] 初始化後驗證，渲染的項目數量:', renderedItems.length);
                if (renderedItems.length === 0 && bookmarks.length > 0) {
                    console.error('[DEBUG] 警告：書籤數據存在但未渲染！');
                    // 再次嘗試渲染
                    (async () => {
                        await renderBookmarks();
                    })();
                }
        }, 100);
    } else {
        bookmarkList.innerHTML = '<p class="placeholder">還沒有書籤</p>';
    }
}

// 確保在 DOM 載入完成後初始化書籤和設置事件監聽器
(function() {
    let initialized = false;
    
    function initAll() {
        if (initialized) {
            console.log('[DEBUG] 書籤系統已經初始化，跳過');
            return;
        }
        initialized = true;
        
        console.log('[DEBUG] ========== 開始初始化書籤系統 ==========');
        console.log('[DEBUG] document.readyState:', document.readyState);
        console.log('[DEBUG] bookmarkList 元素存在:', !!document.getElementById('bookmarkList'));
        console.log('[DEBUG] bookmarkBtn 元素存在:', !!document.getElementById('bookmarkBtn'));
        
        // 先初始化書籤渲染
        initBookmarks();
        
        // 然後設置事件監聽器
        setupBookmarkButton();
        setupBookmarkEventListeners();
        
        console.log('[DEBUG] ========== 書籤系統初始化完成 ==========');
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            console.log('[DEBUG] DOMContentLoaded 事件觸發');
            initAll();
        });
    } else {
        // DOM 已經載入完成，立即執行
        console.log('[DEBUG] DOM 已載入，立即初始化');
        // 使用 setTimeout 確保所有腳本都執行完畢
        setTimeout(initAll, 0);
    }
})();

// ==================== 單字庫功能 ====================

let currentWordData = null; // 當前查看的單字資訊
let reviewWords = []; // 複習用的單字列表
let currentReviewIndex = 0; // 當前複習的單字索引
let showAnswer = false; // 是否顯示答案
let correctAnswers = 0; // 正確答案數量
let reviewMode = 'spaced'; // 複習模式：'spaced'、'random' 或 'fill-in-blank'
let fillInBlankAnswer = ''; // 用戶填寫的答案
let fillInBlankSubmitted = false; // 是否已提交答案

// 載入單字庫選單
async function loadBankSelect() {
    const bankSelect = document.getElementById('bankSelect');
    const reviewBankSelect = document.getElementById('reviewBankSelect');

    const nickname = getCurrentNickname();
    if (!nickname) return;

    try {
        const response = await fetch(`/api/word-banks?nickname=${encodeURIComponent(nickname)}`);
        if (!response.ok) throw new Error('無法載入單字庫列表');
        
        const data = await response.json();
        const banks = data.word_banks || [];
        
        // 更新加入單字庫的選單
        if (bankSelect) {
            bankSelect.innerHTML = '<option value="">選擇單字庫...</option>';
            banks.forEach(bank => {
                const option = document.createElement('option');
                option.value = bank.name;
                option.textContent = `${bank.name} (${bank.word_count} 個單字)`;
                bankSelect.appendChild(option);
            });
        }
        
        // 更新複習用的選單
        if (reviewBankSelect) {
            reviewBankSelect.innerHTML = '<option value="">請選擇單字庫...</option>';
            banks.forEach(bank => {
                const option = document.createElement('option');
                option.value = bank.name;
                option.textContent = `${bank.name} (${bank.word_count} 個單字)`;
                reviewBankSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('[DEBUG] 載入單字庫列表失敗:', error);
    }
}

// 載入單字庫選單（用於modal）
async function loadBankSelectForModal() {
    const modalFooter = document.getElementById('wordModalFooter');
    const nickname = getCurrentNickname();

    console.log('[調試] loadBankSelectForModal 開始執行');
    console.log('[調試] 當前暱稱:', nickname);

    if (!nickname) {
        console.log('[調試] 沒有暱稱，顯示簡化的加入選項');
        modalFooter.innerHTML = `
            <div class="add-to-bank-section">
                <p style="color: #666;">設定暱稱後即可將單字加入個人單字庫</p>
                <button onclick="showNicknameModal()" class="retry-btn">設定暱稱</button>
            </div>
        `;
        return;
    }

    try {
        console.log('[調試] 開始載入單字庫列表，暱稱:', nickname);
        const response = await fetch(`/api/word-banks?nickname=${encodeURIComponent(nickname)}`);
        console.log('[調試] API 響應狀態:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[調試] API 錯誤響應:', errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        console.log('[調試] API 返回數據:', data);
        const banks = data.word_banks || [];
        console.log('[調試] 單字庫數量:', banks.length);

        // 生成完整的footer HTML
        let html = `
            <div class="add-to-bank-section">
                <label for="bankSelect">加入單字庫：</label>
                <select id="bankSelect" class="bank-select">
                    <option value="">選擇單字庫...</option>`;

        banks.forEach(bank => {
            console.log('[調試] 添加單字庫:', bank.name, bank.word_count);
            html += `<option value="${bank.name.replace(/"/g, '&quot;')}">${bank.name} (${bank.word_count} 個單字)</option>`;
        });

        html += `
                </select>
                <button id="addToBankBtn" class="add-to-bank-btn">加入</button>
                <button id="createBankBtn" class="create-bank-btn">新建單字庫</button>
            </div>
        `;

        console.log('[調試] 設置 modalFooter HTML');
        modalFooter.innerHTML = html;

        // 重新綁定事件監聽器
        setupModalBankEvents();
        console.log('[調試] 單字庫載入完成');

    } catch (error) {
        console.error('[調試] 載入單字庫列表失敗:', error);
        modalFooter.innerHTML = `
            <div class="add-to-bank-section">
                <p style="color: #c33;">載入單字庫失敗：${error.message}</p>
                <button onclick="loadBankSelectForModal()" class="retry-btn">重試</button>
                <p style="color: #666; font-size: 12px;">如果持續失敗，請重新整理頁面</p>
            </div>
        `;
    }
}

// 設置modal中的單字庫相關事件
function setupModalBankEvents() {
    // 加入單字到單字庫
    const addToBankBtn = document.getElementById('addToBankBtn');
    if (addToBankBtn) {
        addToBankBtn.addEventListener('click', async () => {
            const bankSelect = document.getElementById('bankSelect');
            const bankName = bankSelect.value;

            if (!bankName) {
                alert('請選擇單字庫');
                return;
            }

            if (!window.currentWordData) {
                alert('沒有單字資訊');
                return;
            }

            const nickname = getCurrentNickname();
            if (!nickname) {
                alert('請先設定暱稱');
                return;
            }

            try {
                const response = await fetch(`/api/word-banks/${encodeURIComponent(bankName)}/add-word`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        word: window.currentWordData.word,
                        word_info: window.currentWordData,
                        nickname: nickname
                    })
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || '加入失敗');
                }

                alert('單字已加入單字庫！');
                bankSelect.value = '';

                // 添加學習記錄
                addLearningRecord('word_added', {
                    word: window.currentWordData.word,
                    bank_name: bankName
                });

            } catch (error) {
                console.error('[DEBUG] 加入單字失敗:', error);
                alert('加入失敗：' + error.message);
            }
        });
    }

    // 新建單字庫
    const createBankBtn = document.getElementById('createBankBtn');
    if (createBankBtn) {
        createBankBtn.addEventListener('click', async () => {
            const bankName = prompt('請輸入單字庫名稱：');
            if (!bankName || !bankName.trim()) {
                return;
            }

            const nickname = getCurrentNickname();
            if (!nickname) {
                alert('請先設定暱稱');
                return;
            }

            try {
                const response = await fetch('/api/word-banks', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: bankName.trim(),
                        nickname: nickname
                    })
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || '創建失敗');
                }

                alert('單字庫創建成功！');
                // 重新載入單字庫列表
                loadBankSelectForModal();

            } catch (error) {
                console.error('[DEBUG] 創建單字庫失敗:', error);
                alert('創建失敗：' + error.message);
            }
        });
    }
}

// 加入單字到單字庫
if (document.getElementById('addToBankBtn')) {
    document.getElementById('addToBankBtn').addEventListener('click', async () => {
        const bankSelect = document.getElementById('bankSelect');
        const bankName = bankSelect.value;
        
        if (!bankName) {
            alert('請選擇單字庫');
            return;
        }
        
        if (!window.currentWordData) {
            alert('沒有單字資訊');
            return;
        }

        const nickname = getCurrentNickname();
        if (!nickname) {
            alert('請先設定暱稱');
            return;
        }

        try {
            const response = await fetch(`/api/word-banks/${encodeURIComponent(bankName)}/add-word`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    word: window.currentWordData.word,
                    word_info: window.currentWordData,
                    nickname: nickname
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || '加入失敗');
            }
            
            const result = await response.json();
            alert(result.message || '單字已加入單字庫！');
            bankSelect.value = '';

            // 添加學習記錄
            addLearningRecord('word_added', {
                word: window.currentWordData.word,
                bank_name: bankName
            });
        } catch (error) {
            console.error('[DEBUG] 加入單字失敗:', error);
            alert('加入失敗：' + error.message);
        }
    });
}

// 新建單字庫
if (document.getElementById('createBankBtn')) {
    document.getElementById('createBankBtn').addEventListener('click', () => {
        const bankName = prompt('請輸入單字庫名稱：');
        if (!bankName || !bankName.trim()) {
            return;
        }
        
        createWordBank(bankName.trim());
    });
}

// 創建單字庫
async function createWordBank(bankName) {
    try {
        const nickname = getCurrentNickname();
        if (!nickname) {
            alert('請先設定暱稱');
            return;
        }

        const response = await fetch('/api/word-banks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: bankName,
                nickname: nickname
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || '創建失敗');
        }
        
        alert('單字庫創建成功！');
        await loadBankSelect();
        const bankSelect = document.getElementById('bankSelect');
        if (bankSelect) {
            bankSelect.value = bankName;
        }
    } catch (error) {
        console.error('[DEBUG] 創建單字庫失敗:', error);
        alert('創建失敗：' + error.message);
    }
}

// 打開單字庫管理界面
if (document.getElementById('wordBankBtn')) {
    document.getElementById('wordBankBtn').addEventListener('click', () => {
        const modal = document.getElementById('wordBankModal');
        modal.style.display = 'flex';
        loadBankList();
        loadBankSelect();
    });
}

// 關閉單字庫管理界面
if (document.getElementById('wordBankModalClose')) {
    document.getElementById('wordBankModalClose').addEventListener('click', () => {
        document.getElementById('wordBankModal').style.display = 'none';
    });
}

// 載入單字庫列表
async function loadBankList() {
    const bankList = document.getElementById('bankList');
    if (!bankList) return;

    bankList.innerHTML = '<div class="loading-spinner">載入中...</div>';

    try {
        const nickname = getCurrentNickname();
        if (!nickname) return;

        const response = await fetch(`/api/word-banks?nickname=${encodeURIComponent(nickname)}`);
        if (!response.ok) throw new Error('無法載入單字庫列表');
        
        const data = await response.json();
        const banks = data.word_banks || [];
        
        if (banks.length === 0) {
            bankList.innerHTML = '<p class="placeholder">還沒有單字庫，點擊「新建單字庫」創建一個吧！</p>';
            return;
        }
        
        let html = '';
        banks.forEach(bank => {
            html += `
                <div class="bank-item">
                    <div class="bank-item-info">
                        <h3>${bank.name}</h3>
                        <p>${bank.word_count} 個單字</p>
                        <p class="bank-date">創建時間：${new Date(bank.created_at).toLocaleString('zh-TW')}</p>
                    </div>
                    <div class="bank-item-actions">
                        <button class="view-bank-btn" onclick="viewBankContent('${bank.name}')">查看</button>
                        <button class="delete-bank-btn" onclick="deleteWordBank('${bank.name}')">刪除</button>
                    </div>
                </div>
            `;
        });
        
        bankList.innerHTML = html;
    } catch (error) {
        console.error('[DEBUG] 載入單字庫列表失敗:', error);
        bankList.innerHTML = '<p class="placeholder" style="color: #c33;">載入失敗：' + error.message + '</p>';
    }
}

// 查看單字庫內容
async function viewBankContent(bankName) {
    const modal = document.getElementById('bankContentModal');
    const title = document.getElementById('bankContentTitle');
    const content = document.getElementById('bankContent');

    if (!modal || !title || !content) return;

    title.textContent = `單字庫：${bankName}`;
    content.innerHTML = '<div class="loading-spinner">載入中...</div>';
    modal.style.display = 'flex';

    const nickname = getCurrentNickname();
    if (!nickname) return;

    try {
        const response = await fetch(`/api/word-banks/${encodeURIComponent(bankName)}?nickname=${encodeURIComponent(nickname)}`);
        if (!response.ok) throw new Error('無法載入單字庫內容');
        
        const data = await response.json();
        const words = data.words || [];
        
        if (words.length === 0) {
            content.innerHTML = '<p class="placeholder">這個單字庫還沒有單字</p>';
            return;
        }
        
        // 保存當前單字庫的單字列表
        currentBankWords = words;
        
        let html = '<div class="bank-words-list">';
        words.forEach((item, index) => {
            const word = item.word.replace(/'/g, "\\'");
            html += `
                <div class="bank-word-item">
                    <div class="bank-word-info">
                        <h4 class="bank-word-title" onclick="showWordInfoFromBankByIndex(${index})">${item.word}</h4>
                        <p class="bank-word-date">加入時間：${new Date(item.added_at).toLocaleString('zh-TW')}</p>
                    </div>
                    <button class="remove-word-btn" onclick="removeWordFromBank('${bankName.replace(/'/g, "\\'")}', '${word}')">移除</button>
                </div>
            `;
        });
        html += '</div>';
        
        content.innerHTML = html;
    } catch (error) {
        console.error('[DEBUG] 載入單字庫內容失敗:', error);
        content.innerHTML = '<p class="placeholder" style="color: #c33;">載入失敗：' + error.message + '</p>';
    }
}

// 從單字庫移除單字
async function removeWordFromBank(bankName, word) {
    if (!confirm(`確定要從「${bankName}」移除單字「${word}」嗎？`)) {
        return;
    }
    
    try {
        const nickname = getCurrentNickname();
        if (!nickname) {
            alert('請先設定暱稱');
            return;
        }

        const response = await fetch(`/api/word-banks/${encodeURIComponent(bankName)}/remove-word`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                word: word,
                nickname: nickname
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || '移除失敗');
        }
        
        alert('單字已移除');
        viewBankContent(bankName);
        loadBankList();
    } catch (error) {
        console.error('[DEBUG] 移除單字失敗:', error);
        alert('移除失敗：' + error.message);
    }
}

// 刪除單字庫
async function deleteWordBank(bankName) {
    if (!confirm(`確定要刪除單字庫「${bankName}」嗎？此操作無法復原！`)) {
        return;
    }
    
    const nickname = getCurrentNickname();
    if (!nickname) {
        alert('請先設定暱稱');
        return;
    }

    try {
        const response = await fetch(`/api/word-banks/${encodeURIComponent(bankName)}?nickname=${encodeURIComponent(nickname)}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || '刪除失敗');
        }
        
        alert('單字庫已刪除');
        loadBankList();
        loadBankSelect();
    } catch (error) {
        console.error('[DEBUG] 刪除單字庫失敗:', error);
        alert('刪除失敗：' + error.message);
    }
}

// 新建單字庫按鈕（在單字庫列表中）
if (document.getElementById('createNewBankBtn')) {
    document.getElementById('createNewBankBtn').addEventListener('click', () => {
        const bankName = prompt('請輸入單字庫名稱：');
        if (!bankName || !bankName.trim()) {
            return;
        }
        
        createWordBank(bankName.trim()).then(() => {
            loadBankList();
        });
    });
}

// 匯出單字庫
if (document.getElementById('exportBanksBtn')) {
    document.getElementById('exportBanksBtn').addEventListener('click', async () => {
        try {
            const response = await fetch('/api/word-banks/export');
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || '匯出失敗');
            }
            
            // 獲取文件名（從 Content-Disposition header）
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'word_banks.json';
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
                if (filenameMatch) {
                    filename = filenameMatch[1];
                }
            }
            
            // 下載文件
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            alert('單字庫匯出成功！');
        } catch (error) {
            console.error('[DEBUG] 匯出失敗:', error);
            alert('匯出失敗：' + error.message);
        }
    });
}

// 匯入單字庫
if (document.getElementById('importBanksBtn')) {
    document.getElementById('importBanksBtn').addEventListener('click', () => {
        const fileInput = document.getElementById('importFileInput');
        if (fileInput) {
            fileInput.click();
        }
    });
}

// 處理文件選擇
if (document.getElementById('importFileInput')) {
    document.getElementById('importFileInput').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) {
            return;
        }
        
        if (!file.name.endsWith('.json')) {
            alert('請選擇 JSON 格式的文件');
            e.target.value = ''; // 清除選擇
            return;
        }
        
        // 確認匯入
        if (!confirm(`確定要匯入單字庫嗎？\n如果單字庫名稱相同，會合併單字。`)) {
            e.target.value = ''; // 清除選擇
            return;
        }
        
        try {
            const formData = new FormData();
            formData.append('file', file);
            
            const response = await fetch('/api/word-banks/import', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || '匯入失敗');
            }
            
            const result = await response.json();
            alert(result.message || '匯入成功！');
            
            // 重新載入單字庫列表
            loadBankList();
            loadBankSelect();
            
        } catch (error) {
            console.error('[DEBUG] 匯入失敗:', error);
            alert('匯入失敗：' + error.message);
        } finally {
            // 清除文件選擇
            e.target.value = '';
        }
    });
}

// 關閉單字庫內容 Modal
if (document.getElementById('bankContentModalClose')) {
    document.getElementById('bankContentModalClose').addEventListener('click', () => {
        document.getElementById('bankContentModal').style.display = 'none';
    });
}

// 標籤切換
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        
        // 更新按鈕狀態
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // 更新內容顯示
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        if (tab === 'list') {
            document.getElementById('bankListTab').classList.add('active');
        } else if (tab === 'review') {
            document.getElementById('reviewTab').classList.add('active');
        }
    });
});

// 複習模式切換
document.querySelectorAll('.review-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // 移除所有按鈕的active類
        document.querySelectorAll('.review-mode-btn').forEach(b => b.classList.remove('active'));
        // 添加當前按鈕的active類
        btn.classList.add('active');

        // 更新複習模式
        reviewMode = btn.dataset.mode;
        console.log('[複習模式] 切換到:', reviewMode);
    });
});

// 開始複習
if (document.getElementById('startReviewBtn')) {
    document.getElementById('startReviewBtn').addEventListener('click', async () => {
        const bankName = document.getElementById('reviewBankSelect').value;
        if (!bankName) {
            alert('請選擇單字庫');
            return;
        }

        const nickname = getCurrentNickname();
        if (!nickname) {
            alert('請先設定暱稱');
            return;
        }

        try {
            if (reviewMode === 'spaced') {
                // 間隔重複學習模式
                const response = await fetch(`/api/word-banks/${encodeURIComponent(bankName)}/spaced-repetition?nickname=${encodeURIComponent(nickname)}`);
                if (!response.ok) throw new Error('無法載入複習單字');

                const data = await response.json();
                const words = data.words || [];

                if (words.length === 0) {
                    alert('目前沒有需要複習的單字');
                    return;
                }

                reviewWords = words;
                console.log(`[間隔重複] 載入 ${words.length} 個單字進行複習，其中 ${data.review_count} 個需要複習，${data.new_count} 個新單字`);
            } else if (reviewMode === 'fill-in-blank') {
                // 填空模式 - 載入所有單字
                const response = await fetch(`/api/word-banks/${encodeURIComponent(bankName)}?nickname=${encodeURIComponent(nickname)}`);
                if (!response.ok) throw new Error('無法載入單字庫內容');

                const data = await response.json();
                const words = data.words || [];

                if (words.length === 0) {
                    alert('這個單字庫沒有單字');
                    return;
                }

                // 打亂順序
                reviewWords = words.sort(() => Math.random() - 0.5);
                console.log(`[填空模式] 載入 ${words.length} 個單字進行複習`);
            } else {
                // 隨機複習模式
                const response = await fetch(`/api/word-banks/${encodeURIComponent(bankName)}?nickname=${encodeURIComponent(nickname)}`);
                if (!response.ok) throw new Error('無法載入單字庫內容');

                const data = await response.json();
                const words = data.words || [];

                if (words.length === 0) {
                    alert('這個單字庫沒有單字');
                    return;
                }

                // 打亂順序
                reviewWords = words.sort(() => Math.random() - 0.5);
            }

            currentReviewIndex = 0;
            showAnswer = false;
            correctAnswers = 0;
            fillInBlankAnswer = '';
            fillInBlankSubmitted = false;

            displayReviewCard();
        } catch (error) {
            console.error('[DEBUG] 載入複習單字失敗:', error);
            alert('載入失敗：' + error.message);
        }
    });
}

// 生成部分字母（填空模式用）
function generatePartialWord(word) {
    if (!word || word.length === 0) return '';
    
    const wordLength = word.length;
    // 根據單字長度決定顯示的字母數量
    let revealCount;
    if (wordLength <= 3) {
        revealCount = 1; // 短單字顯示1個字母
    } else if (wordLength <= 6) {
        revealCount = 2; // 中等單字顯示2個字母
    } else {
        revealCount = 3; // 長單字顯示3個字母
    }
    
    // 隨機選擇要顯示的字母位置（優先顯示開頭和結尾）
    const positions = [];
    if (wordLength > 1) {
        positions.push(0); // 總是顯示第一個字母
        if (wordLength > 2 && revealCount > 1) {
            positions.push(wordLength - 1); // 顯示最後一個字母
        }
        if (revealCount > 2 && wordLength > 3) {
            // 隨機選擇中間的一個位置
            const middlePos = Math.floor(wordLength / 2);
            if (!positions.includes(middlePos)) {
                positions.push(middlePos);
            }
        }
    }
    
    // 生成部分字母字符串
    let result = '';
    for (let i = 0; i < wordLength; i++) {
        if (positions.includes(i)) {
            result += word[i];
        } else {
            result += '_';
        }
    }
    
    return result;
}

// 顯示複習卡片
function displayReviewCard() {
    const reviewContent = document.getElementById('reviewContent');
    if (!reviewContent) return;
    
    if (currentReviewIndex >= reviewWords.length) {
        // 記錄複習結果
        const nickname = getCurrentNickname();
        if (nickname && reviewWords.length > 0) {
            recordReviewResult(nickname, correctAnswers, reviewWords.length);

            // 添加學習記錄
            const accuracy = Math.round((correctAnswers / reviewWords.length) * 100);
            addLearningRecord('word_review', {
                word_count: reviewWords.length,
                correct_answers: correctAnswers,
                accuracy: accuracy,
                mode: reviewMode,
                bank_name: document.getElementById('reviewBankSelect').value
            });
        }

        reviewContent.innerHTML = `
            <div class="review-complete">
                <h2>🎉 複習完成！</h2>
                <p>您已經複習了 ${reviewWords.length} 個單字，正確率：${reviewWords.length > 0 ? Math.round((correctAnswers / reviewWords.length) * 100) : 0}%</p>
                <button class="restart-review-btn" onclick="restartReview()">重新開始</button>
            </div>
        `;
        return;
    }
    
    const wordItem = reviewWords[currentReviewIndex];
    const wordInfo = wordItem.word_info || {};
    const word = wordItem.word.replace(/'/g, "\\'");
    const phonetic = (wordInfo.phonetic || '').replace(/'/g, "\\'");
    
    // 填空模式
    if (reviewMode === 'fill-in-blank') {
        // 重置狀態（如果是新單字）
        if (!fillInBlankSubmitted) {
            fillInBlankAnswer = '';
        }
        
        const partialWord = generatePartialWord(wordItem.word);
        const correctWord = wordItem.word.toLowerCase().trim();
        const userAnswer = fillInBlankAnswer.toLowerCase().trim();
        const isCorrect = fillInBlankSubmitted && userAnswer === correctWord;
        
        // 獲取例句（用於例句按鈕）
        let exampleSentence = '';
        let exampleSentenceZh = '';
        let exampleSentenceEn = '';
        if (wordInfo.meanings && wordInfo.meanings.length > 0) {
            const firstMeaning = wordInfo.meanings[0];
            if (firstMeaning.definitions && firstMeaning.definitions.length > 0) {
                const firstDef = firstMeaning.definitions[0];
                if (firstDef.example) {
                    exampleSentenceEn = firstDef.example;
                    exampleSentenceZh = firstDef.exampleZh || '';
                    // 將單字替換為 *****
                    exampleSentence = exampleSentenceEn.replace(new RegExp(wordItem.word, 'gi'), '*****');
                }
            }
        }
        
        let html = `
            <div class="review-card fill-in-blank-card">
                <div class="review-progress">
                    ${currentReviewIndex + 1} / ${reviewWords.length}
                </div>
                <div class="fill-in-blank-section">
                    <div class="partial-word-display">
                        <h2 class="partial-word">${partialWord}</h2>
                    </div>
                    <div class="fill-in-blank-controls">
                        <button class="fill-in-blank-pronounce-btn" onclick="playWordPronunciation('${word}', '${phonetic}')">🔊 發音</button>
                        ${exampleSentence ? `
                            <button class="fill-in-blank-example-btn" onclick="showFillInBlankExample('${exampleSentence.replace(/'/g, "\\'")}', '${exampleSentenceZh.replace(/'/g, "\\'")}', '${exampleSentenceEn.replace(/'/g, "\\'")}')">📝 例句</button>
                        ` : ''}
                    </div>
                    ${fillInBlankSubmitted ? `
                        <div class="fill-in-blank-result ${isCorrect ? 'correct' : 'incorrect'}">
                            ${isCorrect ? '✅ 正確！' : `❌ 錯誤！正確答案是：<strong>${wordItem.word}</strong>`}
                        </div>
                    ` : ''}
                    <div class="fill-in-blank-input-section">
                        <input type="text" id="fillInBlankInput" class="fill-in-blank-input" placeholder="請填入完整的單字" value="${fillInBlankAnswer}" ${fillInBlankSubmitted ? 'disabled' : ''}>
                        ${!fillInBlankSubmitted ? `
                            <button class="fill-in-blank-submit-btn" onclick="submitFillInBlankAnswer()">確認</button>
                        ` : `
                            <button class="fill-in-blank-next-btn" onclick="nextFillInBlankWord()">下一個</button>
                        `}
                    </div>
                </div>
            </div>
        `;
        
        reviewContent.innerHTML = html;
        
        // 如果輸入框未禁用，自動聚焦
        if (!fillInBlankSubmitted) {
            setTimeout(() => {
                const input = document.getElementById('fillInBlankInput');
                if (input) {
                    input.focus();
                    // 添加Enter鍵監聽
                    input.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') {
                            submitFillInBlankAnswer();
                        }
                    });
                }
            }, 100);
        }
        
        return;
    }
    
    // 原有的間隔重複和隨機複習模式
    // 獲取難度等級
    let difficultyClass = 'difficulty-new';
    let difficultyText = '新單字';

    if (reviewMode === 'spaced' && wordItem.learning_data) {
        const level = wordItem.learning_data.level || 0;
        if (level >= 4) {
            difficultyClass = 'difficulty-easy';
            difficultyText = '熟練';
        } else if (level >= 2) {
            difficultyClass = 'difficulty-medium';
            difficultyText = '中等';
        } else if (level >= 1) {
            difficultyClass = 'difficulty-hard';
            difficultyText = '需加強';
        }
    }

    let html = `
        <div class="review-card">
            <div class="review-progress">
                ${currentReviewIndex + 1} / ${reviewWords.length}
                <span class="word-difficulty ${difficultyClass}">${difficultyText}</span>
            </div>
            <div class="review-word-section">
                <h2 class="review-word">${wordItem.word}</h2>
                ${wordInfo.phonetic ? `<p class="review-phonetic">/${wordInfo.phonetic}/</p>` : ''}
                <button class="review-pronounce-btn" onclick="playWordPronunciation('${word}', '${phonetic}')">🔊 發音</button>
            </div>
    `;
    
    if (showAnswer) {
        html += `
            <div class="review-answer-section">
                ${wordInfo.wordTranslation ? `<p class="review-translation"><strong>中文：</strong>${wordInfo.wordTranslation}</p>` : ''}
                ${wordInfo.meanings ? `
                    <div class="review-meanings">
                        ${wordInfo.meanings.map((meaning, idx) => `
                            <div class="review-meaning">
                                <span class="review-part-of-speech">${meaning.partOfSpeech || ''}</span>
                                ${meaning.definitions && meaning.definitions.length > 0 ? `
                                    <div class="review-definition">
                                        <div class="review-definition-en" style="display: flex; align-items: center; gap: 8px;">
                                            <span><strong>英文：</strong>${meaning.definitions[0].definition}</span>
                                            ${(() => {
                                                const escapedDef = meaning.definitions[0].definition.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                                                return `<button class="example-pronounce-btn" onclick="playExamplePronunciation('${escapedDef}')" title="播放定義發音">🔊</button>`;
                                            })()}
                                        </div>
                                        ${meaning.definitions[0].definitionZh ? `
                                            <p class="review-definition-zh"><strong>中文：</strong>${meaning.definitions[0].definitionZh}</p>
                                        ` : ''}
                                        ${meaning.definitions[0].example ? `
                                            <div class="review-example">
                                                <div class="review-example-en" style="display: flex; align-items: center; gap: 8px;">
                                                    <span><strong>例句：</strong>"${meaning.definitions[0].example}"</span>
                                                    ${(() => {
                                                        const escapedExample = meaning.definitions[0].example.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                                                        return `<button class="example-pronounce-btn" onclick="playExamplePronunciation('${escapedExample}')" title="播放例句發音">🔊</button>`;
                                                    })()}
                                                </div>
                                                ${meaning.definitions[0].exampleZh ? `
                                                    <p class="review-example-zh"><strong>中文：</strong>${meaning.definitions[0].exampleZh}</p>
                                                ` : ''}
                                            </div>
                                        ` : ''}
                                    </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    html += `
            <div class="review-actions">
                ${showAnswer ? `
                    <button class="review-btn review-know-btn" onclick="nextReviewWord(true)">認識</button>
                    <button class="review-btn review-dont-know-btn" onclick="nextReviewWord(false)">不認識</button>
                ` : `
                    <button class="review-btn review-show-btn" onclick="showReviewAnswer()">顯示答案</button>
                `}
            </div>
        </div>
    `;
    
    reviewContent.innerHTML = html;
}

// 顯示答案
function showReviewAnswer() {
    showAnswer = true;
    displayReviewCard();
}

// 下一個單字
async function nextReviewWord(know) {
    // 記錄答案
    if (know) {
        correctAnswers++;
    }

    // 在間隔重複模式下更新學習記錄
    if (reviewMode === 'spaced' && currentReviewIndex < reviewWords.length) {
        const wordItem = reviewWords[currentReviewIndex];
        const bankName = document.getElementById('reviewBankSelect').value;
        const nickname = getCurrentNickname();

        if (bankName && nickname && wordItem.word) {
            try {
                await fetch(`/api/word-banks/${encodeURIComponent(bankName)}/update-learning`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        word: wordItem.word,
                        correct: know,
                        nickname: nickname
                    })
                });
                console.log(`[間隔重複] 單字 "${wordItem.word}" 學習記錄已更新，正確: ${know}`);
            } catch (error) {
                console.error('[間隔重複] 更新學習記錄失敗:', error);
            }
        }
    }

    currentReviewIndex++;
    showAnswer = false;
    displayReviewCard();
}

// 重新開始複習
function restartReview() {
    currentReviewIndex = 0;
    showAnswer = false;
    correctAnswers = 0;
    fillInBlankAnswer = '';
    fillInBlankSubmitted = false;
    reviewWords = reviewWords.sort(() => Math.random() - 0.5);
    displayReviewCard();
}

// 提交填空答案（暴露到全局作用域）
window.submitFillInBlankAnswer = function() {
    const input = document.getElementById('fillInBlankInput');
    if (!input) return;
    
    fillInBlankAnswer = input.value.trim();
    if (!fillInBlankAnswer) {
        alert('請輸入答案');
        return;
    }
    
    fillInBlankSubmitted = true;
    const wordItem = reviewWords[currentReviewIndex];
    const correctWord = wordItem.word.toLowerCase().trim();
    const userAnswer = fillInBlankAnswer.toLowerCase().trim();
    const isCorrect = userAnswer === correctWord;
    
    if (isCorrect) {
        correctAnswers++;
    }
    
    displayReviewCard();
};

// 下一個填空單字（暴露到全局作用域）
window.nextFillInBlankWord = function() {
    // 在間隔重複模式下更新學習記錄
    if (reviewMode === 'spaced' && currentReviewIndex < reviewWords.length) {
        const wordItem = reviewWords[currentReviewIndex];
        const bankName = document.getElementById('reviewBankSelect').value;
        const nickname = getCurrentNickname();
        const correctWord = wordItem.word.toLowerCase().trim();
        const userAnswer = fillInBlankAnswer.toLowerCase().trim();
        const isCorrect = userAnswer === correctWord;

        if (bankName && nickname && wordItem.word) {
            fetch(`/api/word-banks/${encodeURIComponent(bankName)}/update-learning`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    word: wordItem.word,
                    correct: isCorrect,
                    nickname: nickname
                })
            }).then(() => {
                console.log(`[填空模式] 單字 "${wordItem.word}" 學習記錄已更新，正確: ${isCorrect}`);
            }).catch(error => {
                console.error('[填空模式] 更新學習記錄失敗:', error);
            });
        }
    }
    
    currentReviewIndex++;
    fillInBlankAnswer = '';
    fillInBlankSubmitted = false;
    displayReviewCard();
};

// 顯示填空模式的例句（暴露到全局作用域）
window.showFillInBlankExample = function(exampleWithStars, exampleZh, exampleEn) {
    // 創建例句Modal
    const modal = document.createElement('div');
    modal.className = 'word-modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="word-modal-content">
            <div class="word-modal-header">
                <h2>例句</h2>
                <button class="word-modal-close" onclick="this.closest('.word-modal').remove()">&times;</button>
            </div>
            <div class="word-modal-body">
                <div class="fill-in-blank-example-content">
                    <div class="example-sentence-en" style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
                        <span><strong>英文：</strong>"${exampleWithStars}"</span>
                        <button class="example-pronounce-btn" onclick="playExamplePronunciation('${exampleEn.replace(/'/g, "\\'")}')" title="播放例句發音">🔊</button>
                    </div>
                    ${exampleZh ? `<p class="example-sentence-zh"><strong>中文：</strong>${exampleZh}</p>` : ''}
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    // 點擊背景關閉
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
};

// 追蹤單字庫內容 modal 是否在打開單字資訊前是打開的
let bankContentModalWasOpen = false;

// 從單字庫顯示單字資訊（通過索引）
function showWordInfoFromBankByIndex(index) {
    if (index >= 0 && index < currentBankWords.length) {
        const item = currentBankWords[index];
        const word = item.word;
        const wordInfo = item.word_info || {};

        // 確保 word 欄位正確
        if (!wordInfo.word) {
            wordInfo.word = word;
        }

        // 檢查單字庫內容 modal 是否打開
        const bankContentModal = document.getElementById('bankContentModal');
        if (bankContentModal && bankContentModal.style.display === 'flex') {
            bankContentModalWasOpen = true;
            bankContentModal.style.display = 'none';
        } else {
            bankContentModalWasOpen = false;
        }

        // 從單字庫點擊，不顯示「加入單字庫」選項
        showWordInfo(word, wordInfo, false);
    } else {
        console.error('[DEBUG] 無效的單字索引:', index);
    }
}

// ================================
// 暱稱系統相關函數
// ================================

// 初始化暱稱系統
function initializeNicknameSystem() {
    // 檢查是否已有儲存的暱稱
    currentNickname = localStorage.getItem('english_learning_nickname');
    console.log('[調試] 初始化暱稱系統，當前暱稱:', currentNickname);

    if (currentNickname) {
        // 顯示暱稱
        showNicknameDisplay(currentNickname);
    } else {
        // 顯示暱稱輸入對話框
        console.log('[調試] 沒有暱稱，顯示輸入對話框');
        showNicknameModal();
    }

    // 設置事件監聽器
    setupNicknameEventListeners();
}

// 顯示暱稱顯示區域
function showNicknameDisplay(nickname) {
    const display = document.getElementById('nicknameDisplay');
    const nicknameSpan = document.getElementById('currentNickname');

    if (display && nicknameSpan) {
        nicknameSpan.textContent = `👤 ${nickname}`;
        display.style.display = 'flex';
    }
}

// 隱藏暱稱顯示區域
function hideNicknameDisplay() {
    const display = document.getElementById('nicknameDisplay');
    if (display) {
        display.style.display = 'none';
    }
}

// 顯示暱稱輸入對話框
function showNicknameModal() {
    const modal = document.getElementById('nicknameModal');
    const input = document.getElementById('nicknameInput');

    if (modal && input) {
        modal.style.display = 'flex';
        input.value = '';
        input.focus();

        // 防止背景滾動
        document.body.style.overflow = 'hidden';
    }
}

// 隱藏暱稱輸入對話框
function hideNicknameModal() {
    const modal = document.getElementById('nicknameModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

// 設置暱稱系統的事件監聽器
function setupNicknameEventListeners() {
    // 確認暱稱按鈕
    const confirmBtn = document.getElementById('confirmNicknameBtn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            const input = document.getElementById('nicknameInput');
            const nickname = input.value.trim();

            if (!nickname) {
                alert('請輸入暱稱');
                input.focus();
                return;
            }

            if (nickname.length > 20) {
                alert('暱稱長度不能超過20個字元');
                input.focus();
                return;
            }

            // 儲存暱稱
            localStorage.setItem('english_learning_nickname', nickname);
            currentNickname = nickname;

            // 隱藏對話框並顯示暱稱
            hideNicknameModal();
            showNicknameDisplay(nickname);
            
            // 暱稱設置後，重新載入書籤
            console.log('[DEBUG] 暱稱已設置，重新載入書籤');
            if (typeof loadAndRenderBookmarks === 'function') {
                loadAndRenderBookmarks();
            } else if (typeof initBookmarks === 'function') {
                initBookmarks();
            }
        });
    }

    // 暱稱輸入框的 Enter 鍵處理
    const input = document.getElementById('nicknameInput');
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('confirmNicknameBtn').click();
            }
        });
    }

    // 更換暱稱按鈕
    const changeBtn = document.getElementById('changeNicknameBtn');
    if (changeBtn) {
        changeBtn.addEventListener('click', () => {
            showNicknameModal();
        });
    }

    // 點擊背景關閉對話框
    const modal = document.getElementById('nicknameModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                // 不允許點擊背景關閉，因為必須輸入暱稱才能使用
                // hideNicknameModal();
            }
        });
    }
}

// 獲取當前暱稱
function getCurrentNickname() {
    return currentNickname;
}

// 在頁面載入完成後初始化
document.addEventListener('DOMContentLoaded', function() {
    initializeNicknameSystem();
});

// ================================
// 統計資訊系統相關函數
// ================================

// 初始化統計資訊系統
function initializeStatsSystem() {
    loadGlobalStats();
    // 每30秒更新一次統計資訊
    setInterval(loadGlobalStats, 30000);
}

// 載入全局統計資訊
async function loadGlobalStats() {
    try {
        const response = await fetch('/api/global/stats');
        if (!response.ok) throw new Error('無法載入統計資訊');

        const data = await response.json();
        updateStatsDisplay(data);
    } catch (error) {
        console.error('[統計系統] 載入統計資訊失敗:', error);
        // 顯示預設值
        updateStatsDisplay({
            total_users: '--',
            total_learning_time: { formatted: '--' },
            online_users: '--'
        });
    }
}

// 更新統計資訊顯示
function updateStatsDisplay(data) {
    const totalUsersEl = document.getElementById('totalUsers');
    const totalTimeEl = document.getElementById('totalTime');
    const onlineUsersEl = document.getElementById('onlineUsers');

    if (totalUsersEl) totalUsersEl.textContent = data.total_users;
    if (totalTimeEl) totalTimeEl.textContent = data.total_learning_time.formatted;
    if (onlineUsersEl) onlineUsersEl.textContent = data.online_users;
}

// ================================
// 排行榜系統相關函數
// ================================

// 初始化排行榜系統
function initializeLeaderboardSystem() {
    // 排行榜按鈕事件
    const leaderboardBtn = document.getElementById('leaderboardBtn');
    if (leaderboardBtn) {
        leaderboardBtn.addEventListener('click', showLeaderboardModal);
    }

    // 排行榜Modal關閉事件
    const leaderboardModalClose = document.getElementById('leaderboardModalClose');
    if (leaderboardModalClose) {
        leaderboardModalClose.addEventListener('click', hideLeaderboardModal);
    }

    // 排行榜標籤切換
    document.querySelectorAll('#leaderboardModal .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;

            // 更新按鈕狀態
            document.querySelectorAll('#leaderboardModal .tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // 更新內容顯示
            document.querySelectorAll('#leaderboardModal .tab-content').forEach(c => c.classList.remove('active'));

            if (tab === 'learning-time') {
                document.getElementById('learningTimeTab').classList.add('active');
                loadLearningTimeLeaderboard();
            } else if (tab === 'review-score') {
                document.getElementById('reviewScoreTab').classList.add('active');
                loadReviewScoreLeaderboard();
            } else if (tab === 'bookmarks') {
                document.getElementById('bookmarksTab').classList.add('active');
                loadBookmarksLeaderboard();
            }
        });
    });
}

// 顯示排行榜Modal
function showLeaderboardModal() {
    const modal = document.getElementById('leaderboardModal');
    if (modal) {
        modal.style.display = 'flex';
        // 預設載入學習時間排行榜
        loadLearningTimeLeaderboard();
    }
}

// 隱藏排行榜Modal
function hideLeaderboardModal() {
    const modal = document.getElementById('leaderboardModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 載入學習時間排行榜
async function loadLearningTimeLeaderboard() {
    const container = document.getElementById('learningTimeLeaderboard');
    if (!container) return;

    container.innerHTML = '<div class="loading-spinner">載入中...</div>';

    try {
        const response = await fetch('/api/leaderboard/learning-time');
        if (!response.ok) throw new Error('無法載入排行榜');

        const data = await response.json();
        const leaderboard = data.leaderboard || [];

        if (leaderboard.length === 0) {
            container.innerHTML = `
                <div class="leaderboard-empty">
                    <h3>📊 還沒有學習記錄</h3>
                    <p>開始學習來登上排行榜吧！</p>
                </div>
            `;
            return;
        }

        let html = '';
        leaderboard.forEach((item, index) => {
            const rank = index + 1;
            const learningTime = formatTime(item.learning_time);

            html += `
                <div class="leaderboard-item">
                    <div class="rank-number rank-${rank <= 3 ? rank : 'other'}">
                        ${rank}
                    </div>
                    <div class="leaderboard-info">
                        <div class="leaderboard-nickname">${item.nickname}</div>
                        <div class="leaderboard-stats">
                            學習時間：${learningTime} | 觀看影片：${item.videos_watched} 部
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    } catch (error) {
        console.error('[DEBUG] 載入學習時間排行榜失敗:', error);
        container.innerHTML = '<p class="placeholder" style="color: #c33;">載入失敗：' + error.message + '</p>';
    }
}

// 載入複習成績排行榜
async function loadReviewScoreLeaderboard() {
    const container = document.getElementById('reviewScoreLeaderboard');
    if (!container) return;

    container.innerHTML = '<div class="loading-spinner">載入中...</div>';

    try {
        const response = await fetch('/api/leaderboard/review-score');
        if (!response.ok) throw new Error('無法載入排行榜');

        const data = await response.json();
        const leaderboard = data.leaderboard || [];

        if (leaderboard.length === 0) {
            container.innerHTML = `
                <div class="leaderboard-empty">
                    <h3>🎯 還沒有複習記錄</h3>
                    <p>開始複習來提升你的成績吧！</p>
                </div>
            `;
            return;
        }

        let html = '';
        leaderboard.forEach((item, index) => {
            const rank = index + 1;

            html += `
                <div class="leaderboard-item">
                    <div class="rank-number rank-${rank <= 3 ? rank : 'other'}">
                        ${rank}
                    </div>
                    <div class="leaderboard-info">
                        <div class="leaderboard-nickname">${item.nickname}</div>
                        <div class="leaderboard-stats">
                            正確率：${item.accuracy}% | 複習次數：${item.review_sessions} 次 | 總題數：${item.review_total}
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    } catch (error) {
        console.error('[DEBUG] 載入複習成績排行榜失敗:', error);
        container.innerHTML = '<p class="placeholder" style="color: #c33;">載入失敗：' + error.message + '</p>';
    }
}

// 載入書籤排行榜
async function loadBookmarksLeaderboard() {
    const container = document.getElementById('bookmarksLeaderboard');
    if (!container) return;

    container.innerHTML = '<div class="loading-spinner">載入中...</div>';

    try {
        const response = await fetch('/api/leaderboard/bookmarks');
        if (!response.ok) throw new Error('無法載入排行榜');

        const data = await response.json();
        const leaderboard = data.leaderboard || [];

        if (leaderboard.length === 0) {
            container.innerHTML = `
                <div class="leaderboard-empty">
                    <h3>🔖 還沒有書籤記錄</h3>
                    <p>開始收藏書籤來學習吧！</p>
                </div>
            `;
            return;
        }

        let html = '';
        leaderboard.forEach((item, index) => {
            const rank = index + 1;
            const viewCount = item.view_count || 0;
            const title = item.title || item.url;
            const displayTitle = title.length > 50 ? title.substring(0, 50) + '...' : title;
            const escapedUrl = item.url.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');

            html += `
                <div class="leaderboard-item bookmark-leaderboard-item" onclick="selectBookmarkFromLeaderboard('${escapedUrl}')" style="cursor: pointer;">
                    <div class="rank-number rank-${rank <= 3 ? rank : 'other'}">
                        ${rank}
                    </div>
                    <div class="leaderboard-info" style="flex: 1;">
                        <div class="leaderboard-nickname" style="font-weight: 600; margin-bottom: 5px;">${displayTitle}</div>
                        <div class="leaderboard-stats">
                            👁️ 觀看次數：${viewCount} 次
                        </div>
                        <div class="bookmark-url" style="font-size: 12px; color: #666; margin-top: 5px; word-break: break-all;">
                            ${item.url}
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    } catch (error) {
        console.error('[DEBUG] 載入書籤排行榜失敗:', error);
        container.innerHTML = '<p class="placeholder" style="color: #c33;">載入失敗：' + error.message + '</p>';
    }
}

// 從排行榜選擇書籤
async function selectBookmarkFromLeaderboard(url) {
    try {
        // 記錄書籤被觀看
        await fetch('/api/bookmarks/record-view', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: url })
        });

        // 載入書籤對應的影片
        await selectBookmark(url);
        
        // 關閉排行榜視窗
        hideLeaderboardModal();
    } catch (error) {
        console.error('[DEBUG] 記錄書籤觀看失敗:', error);
        // 即使記錄失敗，也繼續載入影片
        await selectBookmark(url);
        
        // 關閉排行榜視窗
        hideLeaderboardModal();
    }
}

// 格式化時間顯示
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return `${hours}小時${minutes}分鐘`;
    } else {
        return `${minutes}分鐘`;
    }
}

// 在暱稱系統初始化後也初始化排行榜系統
// ================================
// 學習統計系統相關函數
// ================================

// 學習會話相關變數
let learningSessionStart = null;
let currentLearningVideoId = null;

// 開始學習會話
function startLearningSession(nickname) {
    if (!nickname) return;

    learningSessionStart = Date.now();
    console.log('[學習統計] 開始學習會話，暱稱:', nickname);

    // 添加學習記錄
    addLearningRecord('video_watch', {
        action: 'start',
        timestamp: new Date().toISOString()
    });
}

// 結束學習會話並記錄統計
async function endLearningSession(nickname) {
    if (!nickname || !learningSessionStart) return;

    const sessionDuration = Math.floor((Date.now() - learningSessionStart) / 1000); // 秒

    if (sessionDuration < 10) { // 少於10秒的不記錄
        console.log('[學習統計] 學習時間太短，跳過記錄');
        return;
    }

    try {
        // 更新學習統計
        await updateUserStats(nickname, {
            learning_time: sessionDuration,  // 累加學習時間
            videos_watched: currentLearningVideoId ? 1 : 0  // 如果有觀看影片，累加影片數量
        });

        console.log(`[學習統計] 記錄學習會話：${sessionDuration}秒，影片：${currentLearningVideoId ? '已觀看' : '未觀看'}`);
    } catch (error) {
        console.error('[學習統計] 記錄學習統計失敗:', error);
    }

    learningSessionStart = null;
    currentLearningVideoId = null;
}

// 更新用戶統計
async function updateUserStats(nickname, stats) {
    try {
        const response = await fetch('/api/user/stats/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                nickname: nickname,
                stats: stats
            })
        });

        if (!response.ok) {
            throw new Error('更新統計失敗');
        }

        const result = await response.json();
        console.log('[學習統計] 統計更新成功:', result.stats);
        return result.stats;
    } catch (error) {
        console.error('[學習統計] 更新統計失敗:', error);
        throw error;
    }
}

// 記錄複習結果
async function recordReviewResult(nickname, correct, total) {
    try {
        await updateUserStats(nickname, {
            review_sessions: 1,  // 累加複習次數
            review_correct: correct,  // 累加正確數量
            review_total: total  // 累加總題數
        });
        console.log(`[學習統計] 記錄複習結果：正確${correct}/${total}`);
    } catch (error) {
        console.error('[學習統計] 記錄複習結果失敗:', error);
    }
}

// ================================
// 學習記錄系統相關函數
// ================================

// 初始化學習記錄系統
function initializeLearningRecordsSystem() {
    // 學習記錄按鈕事件
    const learningRecordsBtn = document.getElementById('learningRecordsBtn');
    if (learningRecordsBtn) {
        learningRecordsBtn.addEventListener('click', showLearningRecordsModal);
    }

    // 學習記錄Modal關閉事件
    const learningRecordsModalClose = document.getElementById('learningRecordsModalClose');
    if (learningRecordsModalClose) {
        learningRecordsModalClose.addEventListener('click', hideLearningRecordsModal);
    }

    // 學習記錄標籤切換
    document.querySelectorAll('#learningRecordsModal .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;

            // 更新按鈕狀態
            document.querySelectorAll('#learningRecordsModal .tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // 更新內容顯示
            document.querySelectorAll('#learningRecordsModal .tab-content').forEach(c => c.classList.remove('active'));

            if (tab === 'history') {
                document.getElementById('historyTab').classList.add('active');
                loadLearningHistory();
            } else if (tab === 'progress') {
                document.getElementById('progressTab').classList.add('active');
                loadProgressBankSelect();
            } else if (tab === 'stats') {
                document.getElementById('statsTab').classList.add('active');
                loadLearningStats();
            }
        });
    });

    // 載入進度按鈕事件
    const loadProgressBtn = document.getElementById('loadProgressBtn');
    if (loadProgressBtn) {
        loadProgressBtn.addEventListener('click', loadLearningProgress);
    }
}

// 顯示學習記錄Modal
function showLearningRecordsModal() {
    const modal = document.getElementById('learningRecordsModal');
    if (modal) {
        modal.style.display = 'flex';
        // 預設載入學習歷史
        loadLearningHistory();
    }
}

// 隱藏學習記錄Modal
function hideLearningRecordsModal() {
    const modal = document.getElementById('learningRecordsModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 載入學習歷史
async function loadLearningHistory() {
    const container = document.getElementById('learningHistory');
    if (!container) return;

    container.innerHTML = '<div class="loading-spinner">載入中...</div>';

    try {
        const nickname = getCurrentNickname();
        if (!nickname) return;

        const response = await fetch(`/api/learning-records?nickname=${encodeURIComponent(nickname)}`);
        if (!response.ok) throw new Error('無法載入學習歷史');

        const data = await response.json();
        const records = data.records || [];

        if (records.length === 0) {
            container.innerHTML = `
                <div class="learning-history-empty">
                    <h3>📚 還沒有學習記錄</h3>
                    <p>開始學習來創建你的學習歷史吧！</p>
                </div>
            `;
            return;
        }

        let html = '';
        records.forEach(record => {
            const recordType = getRecordTypeInfo(record.type);
            const timeStr = formatRecordTime(record.timestamp);
            const details = formatRecordDetails(record);

            html += `
                <div class="learning-record-item">
                    <div class="record-type ${recordType.class}">${recordType.text}</div>
                    <div class="record-content">
                        <div class="record-time">${timeStr}</div>
                        <div class="record-title">${recordType.title}</div>
                        <div class="record-details">${details}</div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    } catch (error) {
        console.error('[學習記錄] 載入學習歷史失敗:', error);
        container.innerHTML = '<p class="placeholder" style="color: #c33;">載入失敗：' + error.message + '</p>';
    }
}

// 載入學習統計
async function loadLearningStats() {
    const container = document.getElementById('learningStats');
    if (!container) return;

    container.innerHTML = '<div class="loading-spinner">載入中...</div>';

    try {
        const nickname = getCurrentNickname();
        if (!nickname) return;

        const response = await fetch(`/api/user/stats?nickname=${encodeURIComponent(nickname)}`);
        if (!response.ok) throw new Error('無法載入學習統計');

        const stats = await response.json();

        const totalTime = formatTime(stats.learning_time || 0);
        const accuracy = stats.review_total > 0 ? Math.round((stats.review_correct / stats.review_total) * 100) : 0;

        container.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <span class="stat-value">${totalTime}</span>
                    <span class="stat-label">總學習時間</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">${stats.videos_watched || 0}</span>
                    <span class="stat-label">觀看影片數</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">${stats.words_added || 0}</span>
                    <span class="stat-label">添加單字數</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">${stats.review_sessions || 0}</span>
                    <span class="stat-label">複習次數</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">${accuracy}%</span>
                    <span class="stat-label">複習正確率</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">${stats.review_total || 0}</span>
                    <span class="stat-label">總複習題數</span>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('[學習記錄] 載入學習統計失敗:', error);
        container.innerHTML = '<p class="placeholder" style="color: #c33;">載入失敗：' + error.message + '</p>';
    }
}

// 載入進度單字庫選擇
async function loadProgressBankSelect() {
    const select = document.getElementById('progressBankSelect');
    if (!select) return;

    const nickname = getCurrentNickname();
    if (!nickname) return;

    try {
        const response = await fetch(`/api/word-banks?nickname=${encodeURIComponent(nickname)}`);
        if (!response.ok) throw new Error('無法載入單字庫列表');

        const data = await response.json();
        const banks = data.word_banks || [];

        select.innerHTML = '<option value="">請選擇單字庫...</option>';
        banks.forEach(bank => {
            const option = document.createElement('option');
            option.value = bank.name;
            option.textContent = `${bank.name} (${bank.word_count} 個單字)`;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('[學習記錄] 載入單字庫列表失敗:', error);
    }
}

// 載入學習進度
async function loadLearningProgress() {
    const select = document.getElementById('progressBankSelect');
    const container = document.getElementById('learningProgress');

    if (!select || !container) return;

    const bankName = select.value;
    if (!bankName) {
        container.innerHTML = '<p class="placeholder">請選擇單字庫查看學習進度</p>';
        return;
    }

    container.innerHTML = '<div class="loading-spinner">載入中...</div>';

    try {
        const nickname = getCurrentNickname();
        if (!nickname) return;

        const response = await fetch(`/api/learning-progress/${encodeURIComponent(bankName)}?nickname=${encodeURIComponent(nickname)}`);
        if (!response.ok) throw new Error('無法載入學習進度');

        const progress = await response.json();

        const learnedPercent = Math.round((progress.learned_words / progress.total_words) * 100);
        const reviewingPercent = Math.round((progress.reviewing_words / progress.total_words) * 100);
        const newPercent = Math.round((progress.new_words / progress.total_words) * 100);

        container.innerHTML = `
            <div class="progress-summary">
                <h3>${bankName}</h3>
                <p>總單字數：${progress.total_words} | 完成度：${progress.completion_rate}%</p>
            </div>
            <div class="progress-chart">
                <div class="progress-item">
                    <div class="progress-circle progress-new">${progress.new_words}</div>
                    <div>新單字</div>
                </div>
                <div class="progress-item">
                    <div class="progress-circle progress-reviewing">${progress.reviewing_words}</div>
                    <div>複習中</div>
                </div>
                <div class="progress-item">
                    <div class="progress-circle progress-learned">${progress.learned_words}</div>
                    <div>已熟練</div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('[學習記錄] 載入學習進度失敗:', error);
        container.innerHTML = '<p class="placeholder" style="color: #c33;">載入失敗：' + error.message + '</p>';
    }
}

// 添加學習記錄
async function addLearningRecord(type, data) {
    try {
        const nickname = getCurrentNickname();
        if (!nickname) return;

        await fetch('/api/learning-records', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                nickname: nickname,
                type: type,
                data: data
            })
        });
        console.log(`[學習記錄] 添加記錄: ${type}`);
    } catch (error) {
        console.error('[學習記錄] 添加記錄失敗:', error);
    }
}

// 獲取記錄類型資訊
function getRecordTypeInfo(type) {
    const types = {
        'video_watch': { text: '觀看影片', class: 'record-type-video', title: '觀看影片' },
        'word_review': { text: '單字複習', class: 'record-type-review', title: '複習單字' },
        'phrase_lookup': { text: '片語查詢', class: 'record-type-lookup', title: '查詢片語' },
        'word_lookup': { text: '單字查詢', class: 'record-type-lookup', title: '查詢單字' },
        'word_added': { text: '添加單字', class: 'record-type-lookup', title: '添加單字到單字庫' }
    };
    return types[type] || { text: type, class: 'record-type-lookup', title: type };
}

// 格式化記錄時間
function formatRecordTime(timestamp) {
    try {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffHours / 24);

        if (diffHours < 1) {
            return '剛剛';
        } else if (diffHours < 24) {
            return `${diffHours}小時前`;
        } else if (diffDays < 7) {
            return `${diffDays}天前`;
        } else {
            return date.toLocaleDateString('zh-TW');
        }
    } catch (e) {
        return timestamp;
    }
}

// 格式化記錄詳情
function formatRecordDetails(record) {
    const data = record.data || {};

    switch (record.type) {
        case 'video_watch':
            return `觀看了影片：${data.video_title || '未知影片'}`;
        case 'word_review':
            return `複習了 ${data.word_count || 0} 個單字，正確率 ${data.accuracy || 0}%`;
        case 'phrase_lookup':
            return `查詢片語："${data.phrase || ''}"`;
        case 'word_lookup':
            return `查詢單字："${data.word || ''}"`;
        case 'word_added':
            return `添加單字 "${data.word || ''}" 到單字庫 "${data.bank_name || ''}"`;
        default:
            return JSON.stringify(data);
    }
}

// 風格切換功能
function initializeThemeSystem() {
    const themeSelect = document.getElementById('themeSelect');
    if (!themeSelect) return;

    // 載入保存的風格
    const savedTheme = localStorage.getItem('selectedTheme') || 'default';
    applyTheme(savedTheme);
    themeSelect.value = savedTheme;

    // 監聽風格選擇變化
    themeSelect.addEventListener('change', function(e) {
        const selectedTheme = e.target.value;
        applyTheme(selectedTheme);
        localStorage.setItem('selectedTheme', selectedTheme);
    });
}

// 應用風格
function applyTheme(theme) {
    const body = document.body;
    
    // 移除所有風格類別
    body.classList.remove('theme-blue', 'theme-green', 'theme-orange', 'theme-dark');
    
    // 應用選中的風格（預設風格不需要類別）
    if (theme !== 'default') {
        body.classList.add(`theme-${theme}`);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    initializeStatsSystem();
    initializeNicknameSystem();
    initializeLeaderboardSystem();
    initializeLearningRecordsSystem();
    initializeThemeSystem();
});

// 在頁面卸載前記錄學習統計
window.addEventListener('beforeunload', function() {
    const nickname = getCurrentNickname();
    if (nickname) {
        endLearningSession(nickname);
    }
});

