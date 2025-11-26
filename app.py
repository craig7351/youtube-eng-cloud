from flask import Flask, render_template, jsonify, request, Response, stream_with_context
from flask_cors import CORS
import yt_dlp
import re
import json
from deep_translator import GoogleTranslator
import logging
import threading
import time
import os
import sys
import random
from datetime import datetime, timedelta

app = Flask(__name__)
CORS(app)

# 設定日誌
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 應用根目錄（支援被 PyInstaller 打包後的 exe 放置目錄）
if getattr(sys, 'frozen', False):
    # exe 模式：使用可執行檔所在目錄
    BASE_DIR = os.path.dirname(sys.executable)
else:
    # 開發模式：使用目前檔案所在目錄
    BASE_DIR = os.path.dirname(__file__)

# 快取翻譯結果
translation_cache = {}

# 翻譯進度追蹤（用於多個請求）
translation_progress = {}

# 單字庫文件路徑（與 exe 同層）
WORD_BANK_FILE = os.path.join(BASE_DIR, 'word_banks.json')

# 字幕緩存文件路徑（與 exe 同層）
SUBTITLE_CACHE_FILE = os.path.join(BASE_DIR, 'subtitle_cache.json')

# 翻譯緩存文件路徑（與 exe 同層）
TRANSLATION_CACHE_FILE = os.path.join(BASE_DIR, 'translation_cache.json')

# 用戶資料文件路徑（與 exe 同層）
USER_DATA_FILE = os.path.join(BASE_DIR, 'user_data.json')

# 書籤文件路徑（與 exe 同層）
BOOKMARKS_FILE = os.path.join(BASE_DIR, 'bookmarks.json')

def load_subtitle_cache():
    """載入字幕緩存數據"""
    if os.path.exists(SUBTITLE_CACHE_FILE):
        try:
            with open(SUBTITLE_CACHE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"[字幕緩存] 載入失敗: {e}")
            return {}
    return {}

def save_subtitle_cache(cache):
    """保存字幕緩存數據"""
    try:
        with open(SUBTITLE_CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        logger.error(f"[字幕緩存] 保存失敗: {e}")
        return False

def load_translation_cache():
    """載入翻譯緩存數據"""
    if translation_cache:  # 如果內存中已有緩存，先返回
        return translation_cache
    
    if os.path.exists(TRANSLATION_CACHE_FILE):
        try:
            with open(TRANSLATION_CACHE_FILE, 'r', encoding='utf-8') as f:
                cache = json.load(f)
                translation_cache.update(cache)  # 更新內存緩存
                return cache
        except Exception as e:
            logger.error(f"[翻譯緩存] 載入失敗: {e}")
            return {}
    return {}

def save_translation_cache():
    """保存翻譯緩存數據"""
    try:
        with open(TRANSLATION_CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(translation_cache, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        logger.error(f"[翻譯緩存] 保存失敗: {e}")
        return False

def load_word_banks():
    """載入單字庫數據"""
    if os.path.exists(WORD_BANK_FILE):
        try:
            with open(WORD_BANK_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"[單字庫] 載入失敗: {e}")
            return {}
    return {}

def save_word_banks(word_banks):
    """保存單字庫數據"""
    try:
        with open(WORD_BANK_FILE, 'w', encoding='utf-8') as f:
            json.dump(word_banks, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        logger.error(f"[單字庫] 保存失敗: {e}")
        return False

def load_user_data():
    """載入用戶資料數據"""
    if os.path.exists(USER_DATA_FILE):
        try:
            with open(USER_DATA_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"[用戶資料] 載入失敗: {e}")
            return {}
    return {}

def save_user_data(user_data):
    """保存用戶資料數據"""
    try:
        with open(USER_DATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(user_data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        logger.error(f"[用戶資料] 保存失敗: {e}")
        return False

def load_bookmarks():
    """載入書籤數據"""
    if os.path.exists(BOOKMARKS_FILE):
        try:
            with open(BOOKMARKS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"[書籤] 載入失敗: {e}")
            return {}
    return {}

def save_bookmarks(bookmarks):
    """保存書籤數據"""
    try:
        with open(BOOKMARKS_FILE, 'w', encoding='utf-8') as f:
            json.dump(bookmarks, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        logger.error(f"[書籤] 保存失敗: {e}")
        return False

def get_user_stats(nickname):
    """獲取用戶學習統計"""
    user_data = load_user_data()
    if nickname not in user_data:
        # 初始化新用戶資料
        user_data[nickname] = {
            'learning_time': 0,  # 學習時間（秒）
            'videos_watched': 0,  # 觀看的影片數量
            'words_added': 0,     # 添加的單字數量
            'review_sessions': 0, # 複習次數
            'review_correct': 0,  # 複習正確數量
            'review_total': 0,    # 複習總數量
            'last_active': datetime.now().isoformat(),
            'created_at': datetime.now().isoformat()
        }
        save_user_data(user_data)

    return user_data[nickname]

def update_user_stats(nickname, stats_update):
    """更新用戶統計資料"""
    user_data = load_user_data()
    if nickname not in user_data:
        user_data[nickname] = get_user_stats(nickname)

    user_data[nickname].update(stats_update)
    user_data[nickname]['last_active'] = datetime.now().isoformat()

    save_user_data(user_data)
    return user_data[nickname]

# 應用啟動時載入翻譯緩存（在所有函數定義之後）
load_translation_cache()
logger.info(f"[翻譯緩存] 已載入 {len(translation_cache)} 條翻譯緩存")

def extract_video_id(url):
    """從 YouTube URL 提取影片 ID"""
    patterns = [
        r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)',
        r'youtube\.com\/watch\?.*v=([^&\n?#]+)'
    ]
    
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


def get_subtitle_for_lang(subtitle_data, lang_code):
    """獲取指定語言的字幕內容"""
    import urllib.request
    import time
    
    if not subtitle_data:
        return None
    
    subtitle_url = subtitle_data[0]['url']
    
    # 確保使用 SRT 格式（如果不是，修改 URL）
    if 'fmt=json3' in subtitle_url or 'fmt=json' in subtitle_url:
        subtitle_url = subtitle_url.replace('fmt=json3', 'fmt=srt').replace('fmt=json', 'fmt=srt')
    
    try:
        url_start = time.time()
        with urllib.request.urlopen(subtitle_url, timeout=30) as response:
            subtitle_content = response.read().decode('utf-8')
        url_elapsed = time.time() - url_start
        logger.info(f"[字幕獲取] {lang_code} 字幕內容獲取成功，耗時 {url_elapsed:.2f} 秒，內容長度: {len(subtitle_content)} 字元")
        
        # 檢查內容格式
        if subtitle_content.strip().startswith('{') or subtitle_content.strip().startswith('['):
            logger.warning(f"[字幕獲取] {lang_code} 收到 JSON 格式，嘗試轉換...")
            import json
            json_data = json.loads(subtitle_content)
            subtitle_content = convert_json_to_srt(json_data)
            logger.info(f"[字幕獲取] {lang_code} JSON 轉換為 SRT 完成")
        
        parsed = parse_subtitle_content(subtitle_content)
        logger.info(f"[字幕獲取] {lang_code} 字幕解析完成，解析出 {len(parsed)} 條字幕")
        return parsed
    except Exception as e:
        logger.warning(f"[字幕獲取] {lang_code} 字幕獲取失敗: {e}")
        return None


def get_subtitles(video_id):
    """使用 yt-dlp 獲取英文字幕和中文字幕（先檢查緩存）"""
    # 先檢查緩存
    subtitle_cache = load_subtitle_cache()
    if video_id in subtitle_cache:
        cached_data = subtitle_cache[video_id]
        logger.info(f"[字幕緩存] 找到緩存字幕，video_id: {video_id}")
        return cached_data.get('subtitles', None)
    
    import tempfile
    import os
    
    url = f'https://www.youtube.com/watch?v={video_id}'
    
    # 創建臨時目錄來存放字幕文件
    with tempfile.TemporaryDirectory() as tmpdir:
        # 嘗試多個 player client，按順序嘗試以避免反爬蟲機制
        # 優先使用移動端 client，因為它們較少觸發反爬蟲機制
        player_clients = ['android', 'ios', 'android_embedded', 'tv_embedded', 'web']
        last_error = None
        
        # 檢測是否在雲端環境（Render、Railway 等）
        # Render 會設置 PORT 環境變數，且通常不會有某些本地環境變數
        is_cloud_env = (
            os.environ.get('RENDER') or 
            os.environ.get('RAILWAY_ENVIRONMENT') or 
            os.environ.get('FLY_APP_NAME') or
            (os.environ.get('PORT') and not os.environ.get('HOME'))  # Render 設置 PORT 但沒有 HOME
        )
        
        # 如果無法確定，根據主機名判斷（Render 的主機名通常包含 render.com）
        if not is_cloud_env:
            import socket
            try:
                hostname = socket.gethostname()
                if 'render' in hostname.lower() or 'railway' in hostname.lower():
                    is_cloud_env = True
            except:
                pass
        
        if is_cloud_env:
            logger.info("[字幕獲取] 檢測到雲端環境，將使用更保守的策略")
            base_delay = 3  # 雲端環境使用更長的延遲
            retry_count = 5
        else:
            logger.info("[字幕獲取] 檢測到本地環境，使用標準策略")
            base_delay = 1
            retry_count = 3
        
        logger.info(f"[字幕獲取] 將嘗試 {len(player_clients)} 個 player client: {', '.join(player_clients)}")
        logger.info(f"[字幕獲取] 環境設定: base_delay={base_delay}秒, retry_count={retry_count}")
        
        for client_index, player_client in enumerate(player_clients):
            try:
                logger.info(f"[字幕獲取] ========== 嘗試 {client_index + 1}/{len(player_clients)}: {player_client} ==========")
                
                # 在嘗試前添加隨機延遲（避免被識別為機器人）
                if client_index > 0:
                    delay = base_delay + random.uniform(0, 2)
                    logger.info(f"[字幕獲取] 等待 {delay:.2f} 秒後嘗試下一個 client...")
                    time.sleep(delay)
                
                ydl_opts = {
                    'writesubtitles': True,
                    'writeautomaticsub': True,
                    'subtitleslangs': ['en', 'zh-TW', 'zh-CN', 'en-US', 'en-GB'],
                    'subtitlesformat': 'srt',
                    'skip_download': True,
                    'outtmpl': os.path.join(tmpdir, '%(id)s.%(ext)s'),
                    'quiet': False,
                    'no_warnings': False,
                    'extractor_args': {
                        'youtube': {
                            'player_client': [player_client]
                        }
                    },
                    # 添加重試機制（雲端環境使用更多重試）
                    'retries': retry_count,
                    'fragment_retries': retry_count,
                    # 添加延遲以避免觸發速率限制（雲端環境使用更長延遲）
                    'sleep_interval': base_delay,
                    'sleep_interval_requests': base_delay,
                    # 添加 User-Agent 偽裝（模擬真實瀏覽器）
                    'user_agent': 'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
                }
                
                logger.info(f"[字幕獲取] 開始使用 yt-dlp 獲取影片資訊...")
                logger.info(f"[字幕獲取] URL: {url}")
                
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=False)
                
                logger.info(f"[字幕獲取] 影片資訊獲取成功 (使用 {player_client})")
                
                # 檢查可用的字幕
                subtitles = info.get('subtitles', {})
                auto_captions = info.get('automatic_captions', {})
                
                logger.info(f"[字幕獲取] 可用字幕語言: {list(subtitles.keys())}")
                logger.info(f"[字幕獲取] 可用自動字幕語言: {list(auto_captions.keys())}")
                
                # 尋找英文字幕
                en_subtitle_data = None
                en_lang = None
                for lang_code in ['en', 'en-US', 'en-GB']:
                    if lang_code in subtitles:
                        en_subtitle_data = subtitles[lang_code]
                        en_lang = lang_code
                        break
                    elif lang_code in auto_captions:
                        en_subtitle_data = auto_captions[lang_code]
                        en_lang = lang_code
                        break
                
                # 尋找中文字幕（優先繁體，其次簡體）
                zh_subtitle_data = None
                zh_lang = None
                for lang_code in ['zh-TW', 'zh-CN', 'zh-Hant', 'zh-Hans']:
                    if lang_code in subtitles:
                        zh_subtitle_data = subtitles[lang_code]
                        zh_lang = lang_code
                        break
                    elif lang_code in auto_captions:
                        zh_subtitle_data = auto_captions[lang_code]
                        zh_lang = lang_code
                        break
                
                if not en_subtitle_data:
                    logger.warning("[字幕獲取] 找不到英文字幕")
                    # 繼續嘗試下一個 client
                    last_error = "找不到英文字幕"
                    continue
                
                logger.info(f"[字幕獲取] 找到英文字幕: {en_lang}")
                if zh_subtitle_data:
                    logger.info(f"[字幕獲取] 找到中文字幕: {zh_lang}")
                else:
                    logger.info(f"[字幕獲取] 找不到中文字幕，將只返回英文字幕")
                
                # 獲取英文字幕
                en_subtitles = get_subtitle_for_lang(en_subtitle_data, en_lang)
                if not en_subtitles:
                    last_error = "無法獲取英文字幕內容"
                    continue
                
                # 獲取中文字幕（如果有的話）
                zh_subtitles = None
                if zh_subtitle_data:
                    zh_subtitles = get_subtitle_for_lang(zh_subtitle_data, zh_lang)
                
                # 合併字幕（以英文字幕的時間軸為準，匹配中文字幕）
                merged_subtitles = []
                zh_dict = {}
                
                # 建立中文字幕的時間索引
                if zh_subtitles:
                    for zh_sub in zh_subtitles:
                        # 使用開始時間作為鍵
                        key = round(zh_sub['start'], 2)
                        zh_dict[key] = zh_sub['english']  # 中文字幕的內容在 'english' 欄位
                
                # 合併字幕
                for en_sub in en_subtitles:
                    merged_sub = {
                        'start': en_sub['start'],
                        'end': en_sub['end'],
                        'english': en_sub['english']
                    }
                    
                    # 嘗試匹配中文字幕（允許 0.5 秒的時間差）
                    en_start = round(en_sub['start'], 2)
                    matched_zh = None
                    for key in zh_dict:
                        if abs(key - en_start) < 0.5:
                            matched_zh = zh_dict[key]
                            break
                    
                    merged_sub['chinese'] = matched_zh if matched_zh else ''
                    merged_subtitles.append(merged_sub)
                
                logger.info(f"[字幕獲取] 字幕合併完成，共 {len(merged_subtitles)} 條，其中 {sum(1 for s in merged_subtitles if s['chinese'])} 條有中文")
                
                # 保存到緩存
                subtitle_cache = load_subtitle_cache()
                subtitle_cache[video_id] = {
                    'subtitles': merged_subtitles,
                    'cached_at': datetime.now().isoformat()
                }
                save_subtitle_cache(subtitle_cache)
                logger.info(f"[字幕緩存] 已保存字幕到緩存，video_id: {video_id}")
                
                return merged_subtitles
                    
            except Exception as e:
                error_msg = str(e)
                last_error = error_msg
                logger.warning(f"[字幕獲取] 使用 {player_client} 失敗: {error_msg}")
                
                # 如果是 429 錯誤或反爬蟲錯誤，繼續嘗試下一個 client
                if '429' in error_msg or 'bot' in error_msg.lower() or 'Sign in to confirm' in error_msg:
                    logger.info(f"[字幕獲取] 檢測到反爬蟲機制，將嘗試下一個 player client")
                    # 在嘗試下一個 client 前稍作延遲（雲端環境使用更長延遲）
                    if client_index < len(player_clients) - 1:
                        delay = base_delay * 2 + (2 if is_cloud_env else 0)
                        delay += random.uniform(0, 2)  # 添加隨機延遲
                        logger.info(f"[字幕獲取] 等待 {delay:.2f} 秒後嘗試下一個 client...")
                        time.sleep(delay)
                    continue
                else:
                    # 其他錯誤也繼續嘗試
                    if client_index < len(player_clients) - 1:
                        delay = base_delay + (1 if is_cloud_env else 0)
                        delay += random.uniform(0, 1)
                        time.sleep(delay)
                    continue
        
        # 所有 client 都失敗了
        logger.error(f"[字幕獲取] 所有 player client 都失敗，最後錯誤: {last_error}")
        return None


def convert_json_to_srt(json_data):
    """將 YouTube JSON 格式字幕轉換為 SRT 格式"""
    import json
    
    srt_lines = []
    index = 1
    
    # YouTube JSON 格式：{"events": [{"segs": [{"utf8": "text"}], "tStartMs": 1000, "dDurationMs": 2000}, ...]}
    if isinstance(json_data, dict) and 'events' in json_data:
        events = json_data['events']
    elif isinstance(json_data, list):
        events = json_data
    else:
        logger.warning(f"[字幕轉換] 未知的 JSON 格式")
        return ""
    
    for event in events:
        if 'segs' not in event or 'tStartMs' not in event:
            continue
        
        # 提取文字
        text_parts = []
        for seg in event.get('segs', []):
            if 'utf8' in seg:
                text_parts.append(seg['utf8'])
        
        if not text_parts:
            continue
        
        text = ' '.join(text_parts).strip()
        if not text:
            continue
        
        # 時間轉換（毫秒轉秒）
        start_ms = event['tStartMs']
        duration_ms = event.get('dDurationMs', 0)
        end_ms = start_ms + duration_ms
        
        start_sec = start_ms / 1000.0
        end_sec = end_ms / 1000.0
        
        # 轉換為 SRT 時間格式
        start_h = int(start_sec // 3600)
        start_m = int((start_sec % 3600) // 60)
        start_s = int(start_sec % 60)
        start_ms_remainder = int((start_sec % 1) * 1000)
        
        end_h = int(end_sec // 3600)
        end_m = int((end_sec % 3600) // 60)
        end_s = int(end_sec % 60)
        end_ms_remainder = int((end_sec % 1) * 1000)
        
        time_str = f"{start_h:02d}:{start_m:02d}:{start_s:02d},{start_ms_remainder:03d} --> {end_h:02d}:{end_m:02d}:{end_s:02d},{end_ms_remainder:03d}"
        
        srt_lines.append(f"{index}\n{time_str}\n{text}\n")
        index += 1
    
    return '\n'.join(srt_lines)


def parse_subtitle_content(content):
    """解析字幕內容（SRT / VTT 格式），並按句子合併"""
    raw_subtitles = []

    if not content:
        return []

    # 以空行分段（同時支援 SRT 及 VTT）
    blocks = re.split(r'\n\s*\n', content.strip())

    def _parse_timestamp(ts: str):
        """解析單一時間戳，支援 H:MM:SS.mmm / MM:SS.mmm / 逗號或句點"""
        ts = ts.strip()
        if not ts:
            return None

        # 拆出毫秒
        if ',' in ts:
            main, ms = ts.split(',', 1)
        elif '.' in ts:
            main, ms = ts.split('.', 1)
        else:
            return None

        parts = main.split(':')
        if len(parts) == 3:
            h, m, s = parts
        elif len(parts) == 2:
            h, m, s = '0', parts[0], parts[1]
        else:
            return None

        try:
            h = int(h)
            m = int(m)
            s = int(s)
            ms_digits = re.sub(r'\D', '', ms)[:3]
            ms_val = int(ms_digits.ljust(3, '0')) if ms_digits else 0
        except ValueError:
            return None

        return h * 3600 + m * 60 + s + ms_val / 1000.0

    def parse_timecode(line: str):
        if '-->' not in line:
            return None, None
        left, right = line.split('-->', 1)
        start = _parse_timestamp(left)
        end = _parse_timestamp(right)
        return start, end

    for block in blocks:
        # 拆成行並去除前後空白
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        if not lines:
            continue

        # 跳過 WebVTT 標頭
        if lines[0].upper().startswith('WEBVTT'):
            continue

        try:
            time_line = None
            text_lines = []
            start_time = None
            end_time = None

            # 1) SRT：第一行是序號，第二行是時間軸
            if re.fullmatch(r'\d+', lines[0]) and len(lines) >= 2:
                time_line = lines[1]
                text_lines = lines[2:]
                start_time, end_time = parse_timecode(time_line)
            # 2) VTT：第一行直接是時間軸
            else:
                start_time, end_time = parse_timecode(lines[0])
                if start_time is not None:
                    time_line = lines[0]
                    text_lines = lines[1:]

            if time_line is None:
                time_line = lines[0]
                text_lines = lines[1:]
                start_time, end_time = parse_timecode(time_line)

            if start_time is None or end_time is None:
                continue

            text = ' '.join(text_lines).strip()

            if text:
                raw_subtitles.append({
                    'start': start_time,
                    'end': end_time,
                    'english': text
                })
        except Exception as e:
            logger.warning(f"Error parsing subtitle block: {e}")
            continue
    
    # 按句子合併字幕
    return merge_subtitles_by_sentence(raw_subtitles)


def count_words(text):
    """計算文字中的單字數量"""
    if not text:
        return 0
    # 匹配單字（字母、連字號、撇號）
    words = re.findall(r"[a-zA-Z]+(?:[-'][a-zA-Z]+)*", text)
    return len(words)


def merge_subtitles_by_sentence(raw_subtitles):
    """將字幕按句子合併（優先以句點斷句，否則不超過15個單字）"""
    if not raw_subtitles:
        return []
    
    merged = []
    current_sentence = {
        'text_parts': [],
        'start': None,
        'end': None
    }
    
    MAX_WORDS_PER_SENTENCE = 15
    
    for sub in raw_subtitles:
        text = sub['english'].strip()
        if not text:
            continue
        
        # 初始化當前句子的開始時間
        if current_sentence['start'] is None:
            current_sentence['start'] = sub['start']
        
        # 添加文字到當前句子
        current_sentence['text_parts'].append(text)
        current_sentence['end'] = sub['end']
        
        # 合併當前累積的文字
        current_text = ' '.join(current_sentence['text_parts']).strip()
        
        # 優先檢查是否有句點（. ! ?），在句點處斷句
        # 使用正則表達式找到最後一個句點位置（考慮引號後面的標點）
        # 匹配句點、問號、驚嘆號，可能在引號後面
        sentence_end_pattern = r'[.!?]["\']?\s*'
        matches = list(re.finditer(sentence_end_pattern, current_text))
        
        if matches:
            # 找到最後一個句點位置
            last_match = matches[-1]
            end_pos = last_match.end()
            
            # 在句點處分割
            sentence_text = current_text[:end_pos].strip()
            remaining_text = current_text[end_pos:].strip()
            
            # 保存完整的句子
            if sentence_text:
                merged.append({
                    'start': current_sentence['start'],
                    'end': current_sentence['end'],
                    'english': sentence_text
                })
            
            # 如果有剩餘文字，開始新句子
            if remaining_text:
                current_sentence = {
                    'text_parts': [remaining_text],
                    'start': sub['start'],
                    'end': sub['end']
                }
            else:
                # 重置當前句子
                current_sentence = {
                    'text_parts': [],
                    'start': None,
                    'end': None
                }
            continue
        
        # 如果沒有句點，檢查是否超過15個單字
        word_count = count_words(current_text)
        
        # 如果超過15個單字，先保存當前句子
        if word_count > MAX_WORDS_PER_SENTENCE:
            # 移除最後添加的文字（因為它會讓句子超過15個單字）
            last_text = current_sentence['text_parts'].pop()
            last_end = current_sentence['end']
            
            sentence_text = ' '.join(current_sentence['text_parts']).strip()
            if sentence_text:
                merged.append({
                    'start': current_sentence['start'],
                    'end': sub['start'],  # 使用下一個字幕的開始時間作為結束時間
                    'english': sentence_text
                })
            
            # 開始新句子（使用剛才移除的文字）
            current_sentence = {
                'text_parts': [last_text],
                'start': sub['start'],
                'end': last_end
            }
    
    # 處理最後一個未完成的句子
    if current_sentence['text_parts']:
        sentence_text = ' '.join(current_sentence['text_parts']).strip()
        if sentence_text:
            merged.append({
                'start': current_sentence['start'],
                'end': current_sentence['end'],
                'english': sentence_text
            })
    
    logger.info(f"[字幕處理] 原始字幕: {len(raw_subtitles)} 條，合併後: {len(merged)} 條句子")
    return merged


def translate_subtitles(subtitles, progress_key=None, update_callback=None):
    """翻譯字幕為中文，支持進度追蹤和實時更新"""
    start_time = time.time()
    
    logger.info(f"[翻譯] 開始翻譯 {len(subtitles)} 條字幕")
    
    # 確保翻譯緩存已載入
    load_translation_cache()
    
    translator = GoogleTranslator(source='en', target='zh-TW')
    
    translated = []
    translated_count = 0
    cached_count = 0
    needs_save = False
    
    for i, sub in enumerate(subtitles):
        english_text = sub['english']
        
        # 檢查快取（內存和持久化）
        if english_text in translation_cache:
            chinese_text = translation_cache[english_text]
            cached_count += 1
        else:
            try:
                chinese_text = translator.translate(english_text)
                translation_cache[english_text] = chinese_text
                translated_count += 1
                needs_save = True  # 標記需要保存
                
                # 每翻譯 10 條顯示進度
                if translated_count % 10 == 0:
                    elapsed = time.time() - start_time
                    logger.info(f"[翻譯] 進度: {i+1}/{len(subtitles)}, 已翻譯 {translated_count} 條, 快取 {cached_count} 條, 耗時 {elapsed:.2f} 秒")
            except Exception as e:
                logger.warning(f"[翻譯] 翻譯錯誤 (第 {i+1} 條): {e}")
                chinese_text = ''
        
        # 構建翻譯結果
        translated_item = {
            'start': sub['start'],
            'end': sub['end'],
            'english': english_text,
            'chinese': chinese_text
        }
        translated.append(translated_item)
        
        # 更新進度
        if progress_key:
            # 確保進度字典存在
            if progress_key not in translation_progress:
                translation_progress[progress_key] = {
                    'current': 0,
                    'total': len(subtitles),
                    'translated': 0,
                    'cached': 0,
                    'elapsed': 0,
                    'translated_items': []
                }
            
            # 更新進度資訊
            translation_progress[progress_key].update({
                'current': i + 1,
                'total': len(subtitles),
                'translated': translated_count,
                'cached': cached_count,
                'elapsed': time.time() - start_time
            })
            
            # 存儲已翻譯的字幕（用於實時更新）
            translation_progress[progress_key]['translated_items'].append(translated_item)
        
        # 調用更新回調（用於實時顯示）
        if update_callback:
            update_callback(i, translated_item)
    
    elapsed = time.time() - start_time
    logger.info(f"[翻譯] 翻譯完成: 總共 {len(subtitles)} 條, 新翻譯 {translated_count} 條, 快取 {cached_count} 條, 總耗時 {elapsed:.2f} 秒")
    
    # 如果有新翻譯，保存翻譯緩存
    if needs_save:
        save_translation_cache()
        logger.info(f"[翻譯緩存] 已保存 {translated_count} 條新翻譯到緩存")
    
    # 標記完成
    if progress_key:
        translation_progress[progress_key]['completed'] = True
    
    return translated


@app.route('/')
def index():
    """首頁"""
    return render_template('index.html')


@app.route('/api/subtitles/<video_id>')
def get_subtitles_api(video_id):
    """API：獲取字幕（直接從 YouTube 獲取英文和中文字幕，如果沒有中文則啟動翻譯）"""
    start_time = time.time()
    
    try:
        logger.info(f"[API] ========== 開始處理字幕請求 ==========")
        logger.info(f"[API] video_id: {video_id}")
        logger.info(f"[API] 時間: {time.strftime('%Y-%m-%d %H:%M:%S')}")
        
        # 獲取英文字幕和中文字幕
        logger.info(f"[API] 開始獲取字幕...")
        fetch_start = time.time()
        subtitles = get_subtitles(video_id)
        fetch_elapsed = time.time() - fetch_start
        logger.info(f"[API] 獲取字幕完成，耗時 {fetch_elapsed:.2f} 秒")
        
        if not subtitles:
            logger.warning(f"[API] 無法獲取字幕，video_id: {video_id}")
            return jsonify({
                'error': '無法獲取字幕。此影片可能沒有字幕或字幕不可用。'
            }), 404
        
        # 檢查是否有中文字幕
        has_chinese = sum(1 for s in subtitles if s.get('chinese', ''))
        logger.info(f"[API] 字幕統計: 總共 {len(subtitles)} 條，其中 {has_chinese} 條有中文")
        
        # 如果中文字幕少於 10%，啟動翻譯
        if has_chinese < len(subtitles) * 0.1:
            logger.info(f"[API] 中文字幕不足，啟動翻譯機制...")
            progress_key = f"{video_id}_{int(time.time())}"
            translation_progress[progress_key] = {
                'current': 0, 
                'total': len(subtitles), 
                'completed': False,
                'translated_items': []
            }
            
            # 在背景執行翻譯
            def translate_in_background():
                def update_callback(index, translated_item):
                    # 更新原始字幕陣列
                    if index < len(subtitles):
                        subtitles[index]['chinese'] = translated_item['chinese']
                
                translated = translate_subtitles(subtitles, progress_key, update_callback)
                
                # 翻譯完成後，更新字幕緩存
                subtitle_cache = load_subtitle_cache()
                subtitle_cache[video_id] = {
                    'subtitles': subtitles,  # 使用已更新的字幕（包含翻譯）
                    'cached_at': datetime.now().isoformat()
                }
                save_subtitle_cache(subtitle_cache)
                logger.info(f"[字幕緩存] 翻譯完成後已更新字幕緩存，video_id: {video_id}")
            
            thread = threading.Thread(target=translate_in_background)
            thread.daemon = True
            thread.start()
            
            return jsonify({
                'video_id': video_id,
                'subtitles': subtitles,
                'needs_translation': True,
                'translation_progress_key': progress_key,
                'has_chinese': has_chinese,
                'total': len(subtitles)
            })
        else:
            total_elapsed = time.time() - start_time
            logger.info(f"[API] ========== 處理完成 ==========")
            logger.info(f"[API] 總耗時: {total_elapsed:.2f} 秒")
            logger.info(f"[API] 返回 {len(subtitles)} 條字幕")
            
            return jsonify({
                'video_id': video_id,
                'subtitles': subtitles,
                'needs_translation': False
            })
        
    except Exception as e:
        elapsed = time.time() - start_time
        logger.error(f"[API] ========== 發生錯誤 ==========")
        logger.error(f"[API] 耗時: {elapsed:.2f} 秒")
        logger.error(f"[API] 錯誤類型: {type(e).__name__}")
        logger.error(f"[API] 錯誤訊息: {str(e)}")
        logger.error(f"[API] 錯誤詳情:", exc_info=True)
        return jsonify({
            'error': f'處理字幕時發生錯誤：{str(e)}'
        }), 500


@app.route('/api/translation-progress/<progress_key>')
def get_translation_progress(progress_key):
    """API：獲取翻譯進度和已翻譯的字幕"""
    progress = translation_progress.get(progress_key, None)
    if progress is None:
        return jsonify({'error': '找不到進度資訊'}), 404
    
    # 返回進度和新翻譯的字幕項目
    result = {
        'current': progress.get('current', 0),
        'total': progress.get('total', 0),
        'translated': progress.get('translated', 0),
        'cached': progress.get('cached', 0),
        'elapsed': progress.get('elapsed', 0),
        'completed': progress.get('completed', False)
    }
    
    # 獲取上次請求後的新翻譯項目
    last_index = request.args.get('last_index', 0, type=int)
    translated_items = progress.get('translated_items', [])
    new_items = translated_items[last_index:] if last_index < len(translated_items) else []
    
    result['new_items'] = new_items
    result['last_index'] = len(translated_items)
    
    return jsonify(result)


@app.route('/api/subtitles/<video_id>/update')
def update_subtitles_api(video_id):
    """API：更新字幕（翻譯完成後調用）"""
    progress_key = request.args.get('progress_key')
    if not progress_key:
        return jsonify({'error': '缺少 progress_key 參數'}), 400
    
    progress = translation_progress.get(progress_key)
    if not progress or not progress.get('completed'):
        return jsonify({'error': '翻譯尚未完成'}), 400
    
    # 重新獲取字幕（此時應該已經翻譯完成）
    subtitles = get_subtitles(video_id)
    if not subtitles:
        return jsonify({'error': '無法獲取字幕'}), 404
    
    return jsonify({
        'video_id': video_id,
        'subtitles': subtitles,
        'needs_translation': False
    })


@app.route('/api/word/<path:text>')
def get_word_info(text):
    """API：獲取單字資訊（定義、例句等）"""
    import urllib.request
    import json as json_lib
    
    try:
        logger.info(f"[單字API] 查詢文字: {text}")

        # 清理輸入文字
        clean_text = text.strip()
        if not clean_text:
            return jsonify({'error': '文字不能為空'}), 400

        # 檢查是否為片語（包含空格）
        is_phrase = ' ' in clean_text

        # 檢查是否為片語
        if is_phrase:
            # 作為片語處理（直接翻譯）
            try:
                translator = GoogleTranslator(source='en', target='zh-TW')
                phrase_translation = translator.translate(clean_text)
                logger.info(f"[單字API] 片語翻譯成功: {clean_text} -> {phrase_translation}")

                result = {
                    'word': clean_text,
                    'wordTranslation': phrase_translation,
                    'phonetic': '',
                    'meanings': [],
                    'isPhrase': True
                }

                logger.info(f"[單字API] 成功處理片語: {clean_text}")
                return jsonify(result)

            except Exception as e:
                logger.warning(f"[單字API] 片語翻譯失敗: {e}")
                return jsonify({
                    'error': '無法獲取此文字的資訊'
                }), 404
        else:
            # 使用 Free Dictionary API（用於單字）
            api_url = f'https://api.dictionaryapi.dev/api/v2/entries/en/{clean_text}'

            try:
                with urllib.request.urlopen(api_url, timeout=10) as response:
                    data = json_lib.loads(response.read().decode('utf-8'))

                    if not data or len(data) == 0:
                        return jsonify({
                            'error': '找不到此單字的資訊'
                        }), 404

                    # 處理第一個結果
                    entry = data[0]

                    # 提取音標
                    phonetic = entry.get('phonetic', '')
                    if not phonetic and entry.get('phonetics'):
                        for ph in entry['phonetics']:
                            if ph.get('text'):
                                phonetic = ph['text']
                                break

                    # 提取詞義和例句
                    meanings = []
                    for meaning in entry.get('meanings', []):
                        part_of_speech = meaning.get('partOfSpeech', '')
                        definitions = []

                        for def_item in meaning.get('definitions', [])[:3]:  # 最多3個定義
                            definition_text = def_item.get('definition', '')
                            example = def_item.get('example', '')

                            # 翻譯定義為中文
                            definition_zh = ''
                            if definition_text:
                                try:
                                    translator = GoogleTranslator(source='en', target='zh-TW')
                                    definition_zh = translator.translate(definition_text)
                                    logger.info(f"[單字API] 定義翻譯成功: {definition_text[:50]}... -> {definition_zh}")
                                except Exception as e:
                                    logger.warning(f"[單字API] 翻譯定義失敗: {e}")
                                    definition_zh = '（翻譯失敗，請稍後再試）'

                            # 翻譯例句為中文（確保所有例句都有翻譯）
                            example_zh = ''
                            if example:
                                try:
                                    translator = GoogleTranslator(source='en', target='zh-TW')
                                    example_zh = translator.translate(example)
                                    logger.info(f"[單字API] 例句翻譯成功: {example} -> {example_zh}")
                                except Exception as e:
                                    logger.warning(f"[單字API] 翻譯例句失敗: {e}")
                                    # 如果翻譯失敗，至少顯示提示
                                    example_zh = '（翻譯失敗，請稍後再試）'

                            definitions.append({
                                'definition': definition_text,
                                'definitionZh': definition_zh if definition_zh else ('（翻譯中...）' if definition_text else ''),
                                'example': example,
                                'exampleZh': example_zh if example_zh else ('（翻譯中...）' if example else '')
                            })

                        meaning_data = {
                            'partOfSpeech': part_of_speech,
                            'definitions': definitions
                        }

                        # 添加同義詞
                        if meaning.get('synonyms'):
                            meaning_data['synonyms'] = meaning['synonyms']

                        meanings.append(meaning_data)

                    # 翻譯單字本身為中文
                    word_translation = ''
                    try:
                        translator = GoogleTranslator(source='en', target='zh-TW')
                        word_translation = translator.translate(clean_text)
                        logger.info(f"[單字API] 單字翻譯成功: {clean_text} -> {word_translation}")
                    except Exception as e:
                        logger.warning(f"[單字API] 翻譯單字失敗: {e}")
                        word_translation = ''

                    result = {
                        'word': clean_text,
                        'wordTranslation': word_translation,
                        'phonetic': phonetic,
                        'meanings': meanings,
                        'isPhrase': False
                    }

                    logger.info(f"[單字API] 成功獲取單字資訊: {clean_text}")
                    return jsonify(result)

            except urllib.error.HTTPError as e:
                if e.code == 404:
                    # 如果字典API找不到，嘗試作為片語翻譯
                    try:
                        translator = GoogleTranslator(source='en', target='zh-TW')
                        phrase_translation = translator.translate(clean_text)
                        logger.info(f"[單字API] 單字找不到，改為片語翻譯成功: {clean_text} -> {phrase_translation}")

                        result = {
                            'word': clean_text,
                            'wordTranslation': phrase_translation,
                            'phonetic': '',
                            'meanings': [],
                            'isPhrase': True
                        }

                        logger.info(f"[單字API] 成功處理為片語: {clean_text}")
                        return jsonify(result)

                    except Exception as e:
                        logger.warning(f"[單字API] 片語翻譯失敗: {e}")
                        return jsonify({
                            'error': '無法獲取此文字的資訊'
                        }), 404
                else:
                    raise
        
    except Exception as e:
        logger.error(f"[單字API] 獲取單字資訊時發生錯誤: {e}", exc_info=True)
        return jsonify({
            'error': f'獲取單字資訊時發生錯誤：{str(e)}'
        }), 500


@app.route('/api/word-banks', methods=['GET'])
def get_word_banks():
    """API：獲取所有單字庫列表"""
    try:
        nickname = request.args.get('nickname', '').strip()
        if not nickname:
            return jsonify({'error': '缺少暱稱參數'}), 400

        word_banks = load_word_banks()
        # 只返回當前用戶的單字庫（以暱稱為前綴）
        banks_list = []
        prefix = f"{nickname}_"
        for bank_name, bank_data in word_banks.items():
            if bank_name.startswith(prefix):
                # 移除暱稱前綴顯示給用戶
                display_name = bank_name[len(prefix):]
                banks_list.append({
                    'name': display_name,
                    'word_count': len(bank_data.get('words', {})),
                    'created_at': bank_data.get('created_at', ''),
                    'updated_at': bank_data.get('updated_at', '')
                })
        return jsonify({'word_banks': banks_list})
    except Exception as e:
        logger.error(f"[單字庫API] 獲取單字庫列表失敗: {e}", exc_info=True)
        return jsonify({'error': f'獲取單字庫列表失敗：{str(e)}'}), 500

@app.route('/api/word-banks/<bank_name>', methods=['GET'])
def get_word_bank(bank_name):
    """API：獲取指定單字庫的內容"""
    try:
        nickname = request.args.get('nickname', '').strip()
        if not nickname:
            return jsonify({'error': '缺少暱稱參數'}), 400

        word_banks = load_word_banks()
        full_bank_name = f"{nickname}_{bank_name}"
        if full_bank_name not in word_banks:
            return jsonify({'error': '單字庫不存在'}), 404

        bank_data = word_banks[full_bank_name]
        # 返回單字列表
        words_list = []
        for word, word_info in bank_data.get('words', {}).items():
            words_list.append({
                'word': word,
                'added_at': word_info.get('added_at', ''),
                'word_info': word_info.get('word_info', {})
            })

        return jsonify({
            'name': bank_name,
            'words': words_list,
            'created_at': bank_data.get('created_at', ''),
            'updated_at': bank_data.get('updated_at', '')
        })
    except Exception as e:
        logger.error(f"[單字庫API] 獲取單字庫內容失敗: {e}", exc_info=True)
        return jsonify({'error': f'獲取單字庫內容失敗：{str(e)}'}), 500

@app.route('/api/word-banks/<bank_name>/add-word', methods=['POST'])
def add_word_to_bank(bank_name):
    """API：將單字加入單字庫"""
    try:
        data = request.get_json()
        word = data.get('word', '').strip().lower()
        word_info = data.get('word_info', {})
        nickname = data.get('nickname', '').strip()

        if not word:
            return jsonify({'error': '單字不能為空'}), 400
        if not nickname:
            return jsonify({'error': '缺少暱稱參數'}), 400

        word_banks = load_word_banks()
        full_bank_name = f"{nickname}_{bank_name}"

        # 如果單字庫不存在，創建新的
        if full_bank_name not in word_banks:
            word_banks[full_bank_name] = {
                'words': {},
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat()
            }

        # 添加單字（包含間隔重複學習的初始數據）
        if 'words' not in word_banks[full_bank_name]:
            word_banks[full_bank_name]['words'] = {}

        word_banks[full_bank_name]['words'][word] = {
            'added_at': datetime.now().isoformat(),
            'word_info': word_info,
            # 間隔重複學習數據
            'learning_data': {
                'level': 0,  # 熟練度等級 (0-5)
                'correct_count': 0,  # 正確次數
                'wrong_count': 0,  # 錯誤次數
                'last_review': None,  # 最後複習時間
                'next_review': datetime.now().isoformat(),  # 下次複習時間
                'review_interval': 1  # 複習間隔（天）
            }
        }
        word_banks[full_bank_name]['updated_at'] = datetime.now().isoformat()

        if save_word_banks(word_banks):
            logger.info(f"[單字庫API] 單字 '{word}' 已加入單字庫 '{full_bank_name}'")
            return jsonify({'success': True, 'message': f'單字已加入單字庫 "{bank_name}"'})
        else:
            return jsonify({'error': '保存失敗'}), 500

    except Exception as e:
        logger.error(f"[單字庫API] 加入單字失敗: {e}", exc_info=True)
        return jsonify({'error': f'加入單字失敗：{str(e)}'}), 500

@app.route('/api/word-banks/<bank_name>/remove-word', methods=['POST'])
def remove_word_from_bank(bank_name):
    """API：從單字庫移除單字"""
    try:
        data = request.get_json()
        word = data.get('word', '').strip().lower()
        nickname = data.get('nickname', '').strip()

        if not word:
            return jsonify({'error': '單字不能為空'}), 400
        if not nickname:
            return jsonify({'error': '缺少暱稱參數'}), 400

        word_banks = load_word_banks()
        full_bank_name = f"{nickname}_{bank_name}"

        if full_bank_name not in word_banks:
            return jsonify({'error': '單字庫不存在'}), 404

        if word in word_banks[full_bank_name].get('words', {}):
            del word_banks[full_bank_name]['words'][word]
            word_banks[full_bank_name]['updated_at'] = datetime.now().isoformat()

            if save_word_banks(word_banks):
                logger.info(f"[單字庫API] 單字 '{word}' 已從單字庫 '{full_bank_name}' 移除")
                return jsonify({'success': True, 'message': f'單字已從單字庫移除'})
            else:
                return jsonify({'error': '保存失敗'}), 500
        else:
            return jsonify({'error': '單字不存在於此單字庫'}), 404

    except Exception as e:
        logger.error(f"[單字庫API] 移除單字失敗: {e}", exc_info=True)
        return jsonify({'error': f'移除單字失敗：{str(e)}'}), 500

@app.route('/api/word-banks/<bank_name>', methods=['DELETE'])
def delete_word_bank(bank_name):
    """API：刪除單字庫"""
    try:
        nickname = request.args.get('nickname', '').strip()
        if not nickname:
            return jsonify({'error': '缺少暱稱參數'}), 400

        word_banks = load_word_banks()
        full_bank_name = f"{nickname}_{bank_name}"

        if full_bank_name not in word_banks:
            return jsonify({'error': '單字庫不存在'}), 404

        del word_banks[full_bank_name]

        if save_word_banks(word_banks):
            logger.info(f"[單字庫API] 單字庫 '{full_bank_name}' 已刪除")
            return jsonify({'success': True, 'message': f'單字庫已刪除'})
        else:
            return jsonify({'error': '保存失敗'}), 500

    except Exception as e:
        logger.error(f"[單字庫API] 刪除單字庫失敗: {e}", exc_info=True)
        return jsonify({'error': f'刪除單字庫失敗：{str(e)}'}), 500

@app.route('/api/word-banks', methods=['POST'])
def create_word_bank():
    """API：創建新單字庫"""
    try:
        data = request.get_json()
        bank_name = data.get('name', '').strip()
        nickname = data.get('nickname', '').strip()

        if not bank_name:
            return jsonify({'error': '單字庫名稱不能為空'}), 400
        if not nickname:
            return jsonify({'error': '缺少暱稱參數'}), 400

        word_banks = load_word_banks()
        full_bank_name = f"{nickname}_{bank_name}"

        if full_bank_name in word_banks:
            return jsonify({'error': '單字庫已存在'}), 400

        word_banks[full_bank_name] = {
            'words': {},
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat()
        }

        if save_word_banks(word_banks):
            logger.info(f"[單字庫API] 單字庫 '{full_bank_name}' 已創建")
            return jsonify({'success': True, 'message': f'單字庫已創建'})
        else:
            return jsonify({'error': '保存失敗'}), 500

    except Exception as e:
        logger.error(f"[單字庫API] 創建單字庫失敗: {e}", exc_info=True)
        return jsonify({'error': f'創建單字庫失敗：{str(e)}'}), 500

@app.route('/api/word-banks/export', methods=['GET'])
def export_word_banks():
    """API：匯出所有單字庫為 JSON"""
    try:
        word_banks = load_word_banks()
        
        # 返回 JSON 數據
        return Response(
            json.dumps(word_banks, ensure_ascii=False, indent=2),
            mimetype='application/json',
            headers={
                'Content-Disposition': f'attachment; filename=word_banks_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
            }
        )
    except Exception as e:
        logger.error(f"[單字庫API] 匯出失敗: {e}", exc_info=True)
        return jsonify({'error': f'匯出失敗：{str(e)}'}), 500

@app.route('/api/word-banks/import', methods=['POST'])
def import_word_banks():
    """API：匯入單字庫（從 JSON）"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': '沒有上傳文件'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': '沒有選擇文件'}), 400
        
        if not file.filename.endswith('.json'):
            return jsonify({'error': '文件格式錯誤，請上傳 JSON 文件'}), 400
        
        # 讀取文件內容
        file_content = file.read().decode('utf-8')
        imported_banks = json.loads(file_content)
        
        if not isinstance(imported_banks, dict):
            return jsonify({'error': '無效的 JSON 格式'}), 400
        
        # 載入現有單字庫
        existing_banks = load_word_banks()
        
        # 處理匯入
        imported_count = 0
        skipped_count = 0
        merged_count = 0
        
        for bank_name, bank_data in imported_banks.items():
            if bank_name in existing_banks:
                # 如果單字庫已存在，詢問是否合併
                # 這裡我們選擇合併（將新單字加入現有單字庫）
                existing_words = existing_banks[bank_name].get('words', {})
                imported_words = bank_data.get('words', {})
                
                # 合併單字（新單字會覆蓋舊單字）
                for word, word_data in imported_words.items():
                    if word not in existing_words:
                        existing_words[word] = word_data
                        merged_count += 1
                
                existing_banks[bank_name]['words'] = existing_words
                existing_banks[bank_name]['updated_at'] = datetime.now().isoformat()
                merged_count += len(imported_words) - merged_count
            else:
                # 新單字庫，直接添加
                existing_banks[bank_name] = bank_data
                imported_count += 1
        
        # 保存
        if save_word_banks(existing_banks):
            logger.info(f"[單字庫API] 匯入完成: 新增 {imported_count} 個單字庫, 合併 {merged_count} 個單字")
            return jsonify({
                'success': True,
                'message': f'匯入成功！新增 {imported_count} 個單字庫，合併 {merged_count} 個單字',
                'imported': imported_count,
                'merged': merged_count
            })
        else:
            return jsonify({'error': '保存失敗'}), 500
            
    except json.JSONDecodeError:
        return jsonify({'error': 'JSON 格式錯誤'}), 400
    except Exception as e:
        logger.error(f"[單字庫API] 匯入失敗: {e}", exc_info=True)
        return jsonify({'error': f'匯入失敗：{str(e)}'}), 500

@app.route('/api/tts/<text>')
def get_tts(text):
    """API：獲取文字轉語音音頻（使用 Google TTS）"""
    import urllib.request
    import urllib.parse
    
    try:
        # 解碼 URL 編碼的文字
        decoded_text = urllib.parse.unquote(text)
        
        # 清理文字
        clean_text = decoded_text.strip().replace('\n', ' ').replace('\r', '')
        if not clean_text:
            return jsonify({'error': '文字不能為空'}), 400
        
        # 限制文字長度（避免 URL 過長）
        if len(clean_text) > 200:
            clean_text = clean_text[:200]
        
        # 使用 Google TTS API
        tts_url = f'https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q={urllib.parse.quote(clean_text)}'
        
        # 獲取音頻數據
        req = urllib.request.Request(tts_url)
        req.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
        
        with urllib.request.urlopen(req, timeout=10) as response:
            audio_data = response.read()
        
        # 返回音頻數據
        return Response(
            audio_data,
            mimetype='audio/mpeg',
            headers={
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'public, max-age=3600'
            }
        )
        
    except Exception as e:
        logger.error(f"[TTS API] 獲取語音失敗: {e}", exc_info=True)
        return jsonify({'error': f'獲取語音失敗：{str(e)}'}), 500


@app.route('/api/user/stats', methods=['GET'])
def get_user_stats_api():
    """API：獲取用戶學習統計"""
    try:
        nickname = request.args.get('nickname', '').strip()
        if not nickname:
            return jsonify({'error': '缺少暱稱參數'}), 400

        stats = get_user_stats(nickname)
        return jsonify(stats)
    except Exception as e:
        logger.error(f"[用戶統計API] 獲取統計失敗: {e}", exc_info=True)
        return jsonify({'error': f'獲取統計失敗：{str(e)}'}), 500


@app.route('/api/user/stats/update', methods=['POST'])
def update_user_stats_api():
    """API：更新用戶學習統計"""
    try:
        data = request.get_json()
        nickname = data.get('nickname', '').strip()
        stats_update = data.get('stats', {})

        if not nickname:
            return jsonify({'error': '缺少暱稱參數'}), 400

        updated_stats = update_user_stats(nickname, stats_update)
        return jsonify({'success': True, 'stats': updated_stats})
    except Exception as e:
        logger.error(f"[用戶統計API] 更新統計失敗: {e}", exc_info=True)
        return jsonify({'error': f'更新統計失敗：{str(e)}'}), 500


@app.route('/api/global/stats', methods=['GET'])
def get_global_stats_api():
    """API：獲取全局統計資訊"""
    try:
        # 在線用戶追蹤（簡易實現）
        online_users = getattr(app, 'online_users', set())

        # 載入用戶資料
        user_data = load_user_data()

        total_users = len(user_data)
        total_learning_time = 0
        online_count = len(online_users)

        # 計算總學習時間
        for nickname, data in user_data.items():
            total_learning_time += data.get('learning_time', 0)

        # 格式化學習時間
        hours = total_learning_time // 3600
        minutes = (total_learning_time % 3600) // 60

        return jsonify({
            'total_users': total_users,
            'total_learning_time': {
                'seconds': total_learning_time,
                'formatted': f'{hours}小時{minutes}分鐘'
            },
            'online_users': online_count,
            'last_updated': datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"[全局統計API] 獲取統計失敗: {e}", exc_info=True)
        return jsonify({'error': f'獲取統計失敗：{str(e)}'}), 500


@app.route('/api/leaderboard/learning-time')
def get_learning_time_leaderboard():
    """API：獲取學習時間排行榜"""
    try:
        user_data = load_user_data()

        # 按學習時間排序
        leaderboard = []
        for nickname, stats in user_data.items():
            leaderboard.append({
                'nickname': nickname,
                'learning_time': stats.get('learning_time', 0),
                'videos_watched': stats.get('videos_watched', 0),
                'last_active': stats.get('last_active', '')
            })

        # 按學習時間降序排序
        leaderboard.sort(key=lambda x: x['learning_time'], reverse=True)

        # 只返回前20名
        return jsonify({'leaderboard': leaderboard[:20]})
    except Exception as e:
        logger.error(f"[排行榜API] 獲取學習時間排行榜失敗: {e}", exc_info=True)
        return jsonify({'error': f'獲取排行榜失敗：{str(e)}'}), 500


@app.route('/api/leaderboard/review-score')
def get_review_score_leaderboard():
    """API：獲取複習分數排行榜"""
    try:
        user_data = load_user_data()

        # 計算複習準確率並排序
        leaderboard = []
        for nickname, stats in user_data.items():
            review_total = stats.get('review_total', 0)
            review_correct = stats.get('review_correct', 0)

            if review_total > 0:
                accuracy = (review_correct / review_total) * 100
            else:
                accuracy = 0

            leaderboard.append({
                'nickname': nickname,
                'review_sessions': stats.get('review_sessions', 0),
                'review_correct': review_correct,
                'review_total': review_total,
                'accuracy': round(accuracy, 2),
                'last_active': stats.get('last_active', '')
            })

        # 按準確率降序排序，準確率相同按總複習數量排序
        leaderboard.sort(key=lambda x: (x['accuracy'], x['review_total']), reverse=True)

        # 只返回前20名
        return jsonify({'leaderboard': leaderboard[:20]})
    except Exception as e:
        logger.error(f"[排行榜API] 獲取複習分數排行榜失敗: {e}", exc_info=True)
        return jsonify({'error': f'獲取排行榜失敗：{str(e)}'}), 500


@app.route('/api/word-banks/<bank_name>/spaced-repetition', methods=['GET'])
def get_spaced_repetition_words(bank_name):
    """API：獲取需要間隔重複複習的單字"""
    try:
        nickname = request.args.get('nickname', '').strip()
        if not nickname:
            return jsonify({'error': '缺少暱稱參數'}), 400

        word_banks = load_word_banks()
        full_bank_name = f"{nickname}_{bank_name}"

        if full_bank_name not in word_banks:
            return jsonify({'error': '單字庫不存在'}), 404

        bank_data = word_banks[full_bank_name]
        words = bank_data.get('words', {})
        now = datetime.now()

        # 篩選需要複習的單字
        review_words = []
        new_words = []

        for word, word_data in words.items():
            learning_data = word_data.get('learning_data', {})
            next_review_str = learning_data.get('next_review')

            if next_review_str:
                try:
                    next_review = datetime.fromisoformat(next_review_str)
                    if now >= next_review:
                        review_words.append({
                            'word': word,
                            'word_info': word_data.get('word_info', {}),
                            'learning_data': learning_data
                        })
                except:
                    # 如果時間格式錯誤，加入複習列表
                    review_words.append({
                        'word': word,
                        'word_info': word_data.get('word_info', {}),
                        'learning_data': learning_data
                    })
            else:
                # 沒有複習時間的新單字
                new_words.append({
                    'word': word,
                    'word_info': word_data.get('word_info', {}),
                    'learning_data': learning_data
                })

        # 優先複習舊單字，然後學習新單字
        result_words = review_words + new_words[:10]  # 每次最多學習10個新單字

        # 按複習時間排序（最久沒複習的優先）
        result_words.sort(key=lambda x: x['learning_data'].get('next_review', ''), reverse=False)

        return jsonify({
            'words': result_words,
            'review_count': len(review_words),
            'new_count': len(new_words)
        })

    except Exception as e:
        logger.error(f"[間隔重複API] 獲取複習單字失敗: {e}", exc_info=True)
        return jsonify({'error': f'獲取複習單字失敗：{str(e)}'}), 500


@app.route('/api/word-banks/<bank_name>/update-learning', methods=['POST'])
def update_word_learning(bank_name):
    """API：更新單字學習記錄（間隔重複學習）"""
    try:
        data = request.get_json()
        word = data.get('word', '').strip().lower()
        correct = data.get('correct', False)
        nickname = data.get('nickname', '').strip()

        if not word:
            return jsonify({'error': '單字不能為空'}), 400
        if not nickname:
            return jsonify({'error': '缺少暱稱參數'}), 400

        word_banks = load_word_banks()
        full_bank_name = f"{nickname}_{bank_name}"

        if full_bank_name not in word_banks:
            return jsonify({'error': '單字庫不存在'}), 404

        if word not in word_banks[full_bank_name].get('words', {}):
            return jsonify({'error': '單字不存在'}), 404

        word_data = word_banks[full_bank_name]['words'][word]
        learning_data = word_data.get('learning_data', {})

        # 更新學習數據
        now = datetime.now()

        if correct:
            learning_data['correct_count'] = learning_data.get('correct_count', 0) + 1
            # 根據艾賓浩斯遺忘曲線計算下次複習間隔
            level = learning_data.get('level', 0)
            if level < 5:  # 最高等級5
                learning_data['level'] = level + 1

            # 計算複習間隔（天）
            intervals = [1, 2, 4, 7, 14]  # 1天、2天、4天、1週、2週
            interval_index = min(level, len(intervals) - 1)
            learning_data['review_interval'] = intervals[interval_index]
        else:
            learning_data['wrong_count'] = learning_data.get('wrong_count', 0) + 1
            # 答錯時降低等級，但不低於0
            learning_data['level'] = max(0, learning_data.get('level', 0) - 1)
            # 答錯後隔天再複習
            learning_data['review_interval'] = 1

        # 更新時間
        learning_data['last_review'] = now.isoformat()
        next_review = now + timedelta(days=learning_data['review_interval'])
        learning_data['next_review'] = next_review.isoformat()

        # 保存更新
        word_data['learning_data'] = learning_data
        word_banks[full_bank_name]['updated_at'] = now.isoformat()

        if save_word_banks(word_banks):
            logger.info(f"[間隔重複API] 單字 '{word}' 學習記錄已更新，正確: {correct}")
            return jsonify({'success': True, 'learning_data': learning_data})
        else:
            return jsonify({'error': '保存失敗'}), 500

    except Exception as e:
        logger.error(f"[間隔重複API] 更新學習記錄失敗: {e}", exc_info=True)
        return jsonify({'error': f'更新學習記錄失敗：{str(e)}'}), 500


@app.route('/api/learning-records', methods=['GET'])
def get_learning_records():
    """API：獲取用戶學習記錄"""
    try:
        nickname = request.args.get('nickname', '').strip()
        limit = request.args.get('limit', 50, type=int)  # 預設返回最近50條記錄

        if not nickname:
            return jsonify({'error': '缺少暱稱參數'}), 400

        user_data = load_user_data()
        if nickname not in user_data:
            return jsonify({'records': []})

        # 如果沒有學習記錄，初始化空列表
        if 'learning_records' not in user_data[nickname]:
            user_data[nickname]['learning_records'] = []
            save_user_data(user_data)

        records = user_data[nickname]['learning_records']

        # 按時間降序排序並限制數量
        records.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
        records = records[:limit]

        return jsonify({'records': records})

    except Exception as e:
        logger.error(f"[學習記錄API] 獲取學習記錄失敗: {e}", exc_info=True)
        return jsonify({'error': f'獲取學習記錄失敗：{str(e)}'}), 500


@app.route('/api/learning-records', methods=['POST'])
def add_learning_record():
    """API：添加學習記錄"""
    try:
        data = request.get_json()
        nickname = data.get('nickname', '').strip()
        record_type = data.get('type', '')  # 'video_watch', 'word_review', 'phrase_lookup' 等
        record_data = data.get('data', {})

        if not nickname:
            return jsonify({'error': '缺少暱稱參數'}), 400
        if not record_type:
            return jsonify({'error': '缺少記錄類型'}), 400

        user_data = load_user_data()
        if nickname not in user_data:
            user_data[nickname] = get_user_stats(nickname)

        # 初始化學習記錄列表
        if 'learning_records' not in user_data[nickname]:
            user_data[nickname]['learning_records'] = []

        # 創建新記錄
        record = {
            'id': f"{int(time.time() * 1000)}_{record_type}",
            'type': record_type,
            'timestamp': datetime.now().isoformat(),
            'data': record_data
        }

        # 添加到記錄列表
        user_data[nickname]['learning_records'].append(record)

        # 限制記錄數量，保留最新的500條
        if len(user_data[nickname]['learning_records']) > 500:
            user_data[nickname]['learning_records'] = user_data[nickname]['learning_records'][-500:]

        save_user_data(user_data)

        logger.info(f"[學習記錄API] 添加學習記錄: {nickname} - {record_type}")
        return jsonify({'success': True, 'record_id': record['id']})

    except Exception as e:
        logger.error(f"[學習記錄API] 添加學習記錄失敗: {e}", exc_info=True)
        return jsonify({'error': f'添加學習記錄失敗：{str(e)}'}), 500


@app.route('/api/learning-progress/<bank_name>', methods=['GET'])
def get_learning_progress(bank_name):
    """API：獲取單字庫學習進度"""
    try:
        nickname = request.args.get('nickname', '').strip()
        if not nickname:
            return jsonify({'error': '缺少暱稱參數'}), 400

        word_banks = load_word_banks()
        full_bank_name = f"{nickname}_{bank_name}"

        if full_bank_name not in word_banks:
            return jsonify({'error': '單字庫不存在'}), 404

        bank_data = word_banks[full_bank_name]
        words = bank_data.get('words', {})

        # 統計學習進度
        total_words = len(words)
        learned_words = 0
        reviewing_words = 0
        new_words = 0

        word_progress = []

        for word, word_data in words.items():
            learning_data = word_data.get('learning_data', {})
            level = learning_data.get('level', 0)
            last_review = learning_data.get('last_review')

            word_info = {
                'word': word,
                'level': level,
                'last_review': last_review,
                'next_review': learning_data.get('next_review'),
                'correct_count': learning_data.get('correct_count', 0),
                'wrong_count': learning_data.get('wrong_count', 0)
            }

            word_progress.append(word_info)

            if level >= 3:  # 等級3以上算作已學習
                learned_words += 1
            elif last_review:  # 有複習記錄但等級低
                reviewing_words += 1
            else:  # 從未複習
                new_words += 1

        progress = {
            'total_words': total_words,
            'learned_words': learned_words,
            'reviewing_words': reviewing_words,
            'new_words': new_words,
            'completion_rate': round((learned_words / total_words * 100), 1) if total_words > 0 else 0,
            'word_progress': word_progress
        }

        return jsonify(progress)

    except Exception as e:
        logger.error(f"[學習進度API] 獲取學習進度失敗: {e}", exc_info=True)
        return jsonify({'error': f'獲取學習進度失敗：{str(e)}'}), 500


@app.route('/api/bookmarks', methods=['GET'])
def get_bookmarks():
    """API：獲取用戶書籤"""
    try:
        nickname = request.args.get('nickname', '').strip()
        if not nickname:
            return jsonify({'error': '缺少暱稱參數'}), 400

        bookmarks_data = load_bookmarks()
        user_bookmarks = bookmarks_data.get(nickname, [])
        
        logger.info(f"[書籤API] 獲取書籤成功，用戶: {nickname}，數量: {len(user_bookmarks)}")
        return jsonify({'bookmarks': user_bookmarks})
    except Exception as e:
        logger.error(f"[書籤API] 獲取書籤失敗: {e}", exc_info=True)
        return jsonify({'error': f'獲取書籤失敗：{str(e)}'}), 500

@app.route('/api/bookmarks', methods=['POST'])
def save_bookmarks_api():
    """API：保存用戶書籤"""
    try:
        data = request.get_json()
        nickname = data.get('nickname', '').strip()
        bookmarks = data.get('bookmarks', [])

        if not nickname:
            return jsonify({'error': '缺少暱稱參數'}), 400

        if not isinstance(bookmarks, list):
            return jsonify({'error': '書籤數據格式錯誤'}), 400

        bookmarks_data = load_bookmarks()
        bookmarks_data[nickname] = bookmarks

        if save_bookmarks(bookmarks_data):
            logger.info(f"[書籤API] 保存書籤成功，用戶: {nickname}，數量: {len(bookmarks)}")
            return jsonify({'success': True, 'message': '書籤已保存'})
        else:
            return jsonify({'error': '保存失敗'}), 500
    except Exception as e:
        logger.error(f"[書籤API] 保存書籤失敗: {e}", exc_info=True)
        return jsonify({'error': f'保存書籤失敗：{str(e)}'}), 500

@app.route('/api/bookmarks', methods=['DELETE'])
def delete_bookmark():
    """API：刪除單個書籤"""
    try:
        data = request.get_json()
        nickname = data.get('nickname', '').strip()
        bookmark_url = data.get('url', '').strip()

        if not nickname:
            return jsonify({'error': '缺少暱稱參數'}), 400
        if not bookmark_url:
            return jsonify({'error': '缺少書籤 URL'}), 400

        bookmarks_data = load_bookmarks()
        if nickname not in bookmarks_data:
            return jsonify({'error': '用戶書籤不存在'}), 404

        user_bookmarks = bookmarks_data[nickname]
        original_count = len(user_bookmarks)
        bookmarks_data[nickname] = [b for b in user_bookmarks if b.get('url') != bookmark_url]
        
        if len(bookmarks_data[nickname]) < original_count:
            if save_bookmarks(bookmarks_data):
                logger.info(f"[書籤API] 刪除書籤成功，用戶: {nickname}")
                return jsonify({'success': True, 'message': '書籤已刪除'})
            else:
                return jsonify({'error': '保存失敗'}), 500
        else:
            return jsonify({'error': '書籤不存在'}), 404
    except Exception as e:
        logger.error(f"[書籤API] 刪除書籤失敗: {e}", exc_info=True)
        return jsonify({'error': f'刪除書籤失敗：{str(e)}'}), 500

@app.route('/api/bookmarks/record-view', methods=['POST'])
def record_bookmark_view():
    """API：記錄書籤被觀看"""
    try:
        data = request.get_json()
        bookmark_url = data.get('url', '').strip()

        if not bookmark_url:
            return jsonify({'error': '缺少書籤 URL'}), 400

        bookmarks_data = load_bookmarks()
        
        # 在所有用戶的書籤中查找並更新觀看次數
        found = False
        for nickname, user_bookmarks in bookmarks_data.items():
            for bookmark in user_bookmarks:
                if bookmark.get('url') == bookmark_url:
                    # 初始化觀看次數
                    if 'view_count' not in bookmark:
                        bookmark['view_count'] = 0
                    bookmark['view_count'] = bookmark.get('view_count', 0) + 1
                    bookmark['last_viewed'] = datetime.now().isoformat()
                    found = True
                    break
            if found:
                break
        
        if found:
            if save_bookmarks(bookmarks_data):
                logger.info(f"[書籤API] 記錄書籤觀看成功，URL: {bookmark_url}")
                return jsonify({'success': True})
            else:
                return jsonify({'error': '保存失敗'}), 500
        else:
            # 書籤不存在，但還是返回成功（可能是在排行榜中點擊的）
            return jsonify({'success': True, 'message': '書籤不存在於任何用戶的書籤中'})
    except Exception as e:
        logger.error(f"[書籤API] 記錄書籤觀看失敗: {e}", exc_info=True)
        return jsonify({'error': f'記錄觀看失敗：{str(e)}'}), 500

@app.route('/api/leaderboard/bookmarks')
def get_bookmark_leaderboard():
    """API：獲取書籤排行榜（按觀看次數排序）"""
    try:
        bookmarks_data = load_bookmarks()
        
        # 收集所有書籤及其觀看次數
        bookmark_stats = {}
        
        for nickname, user_bookmarks in bookmarks_data.items():
            for bookmark in user_bookmarks:
                url = bookmark.get('url', '')
                title = bookmark.get('title', url)
                view_count = bookmark.get('view_count', 0)
                
                if url:
                    # 如果這個 URL 已經存在，累加觀看次數
                    if url in bookmark_stats:
                        bookmark_stats[url]['view_count'] += view_count
                        # 更新標題（使用最新的）
                        bookmark_stats[url]['title'] = title
                    else:
                        bookmark_stats[url] = {
                            'url': url,
                            'title': title,
                            'view_count': view_count,
                            'last_viewed': bookmark.get('last_viewed', '')
                        }
        
        # 轉換為列表並排序
        leaderboard = list(bookmark_stats.values())
        leaderboard.sort(key=lambda x: x['view_count'], reverse=True)
        
        # 只返回前10名
        return jsonify({'leaderboard': leaderboard[:10]})
    except Exception as e:
        logger.error(f"[排行榜API] 獲取書籤排行榜失敗: {e}", exc_info=True)
        return jsonify({'error': f'獲取書籤排行榜失敗：{str(e)}'}), 500


if __name__ == '__main__':
    # 生產環境使用環境變數 PORT，開發環境預設 5000
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_ENV') == 'development'
    app.run(debug=debug, host='0.0.0.0', port=port)

