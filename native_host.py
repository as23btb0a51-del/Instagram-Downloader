import sys
import json
import struct
import os
import re
import urllib.request

def read_message():
    try:
        raw_length = sys.stdin.buffer.read(4)
        if len(raw_length) < 4:
            return None
        msg_length = struct.unpack('@I', raw_length)[0]
        msg_bytes = sys.stdin.buffer.read(msg_length)
        return json.loads(msg_bytes.decode('utf-8'))
    except Exception:
        return None

def send_message(obj):
    try:
        encoded = json.dumps(obj).encode('utf-8')
        sys.stdout.buffer.write(struct.pack('@I', len(encoded)))
        sys.stdout.buffer.write(encoded)
        sys.stdout.buffer.flush()
    except Exception:
        pass

def clean_media_url(url):
    if not url:
        return ""
    cleaned = url.replace('&amp;', '&')
    # Strip byte range chunk limits so Instagram CDN sends the FULL video instead of a 2KB slice!
    cleaned = re.sub(r'([?&])bytestart=\d+&?', r'\1', cleaned)
    cleaned = re.sub(r'([?&])byteend=\d+&?', r'\1', cleaned)
    cleaned = re.sub(r'([?&])range=\d+-\d+&?', r'\1', cleaned)
    cleaned = re.sub(r'[?&]$', '', cleaned)
    return cleaned.replace('?&', '?')

def handle_choose_directory(msg):
    try:
        import tkinter as tk
        from tkinter import filedialog

        current_dir = msg.get("current_dir") if msg else None
        default_downloads = os.path.join(os.path.expanduser("~"), "Downloads")

        if not current_dir or not os.path.exists(current_dir):
            current_dir = default_downloads if os.path.exists(default_downloads) else os.path.expanduser("~")

        root = tk.Tk()
        root.withdraw()
        root.lift()
        root.wm_attributes("-topmost", True)
        root.focus_force()
        root.update()

        folder = filedialog.askdirectory(
            parent=root,
            title="Select Destination Folder for Instagram Downloads",
            initialdir=current_dir,
            mustexist=True
        )
        root.destroy()

        if folder:
            folder = os.path.normpath(folder)
            return {"success": True, "path": folder}
        return {"success": False, "cancelled": True}
    except Exception as e:
        return {"success": False, "error": str(e)}

def handle_save_file(msg):
    raw_url = msg.get("url")
    target_dir = msg.get("target_dir")
    filename = msg.get("filename")

    if not raw_url or not target_dir or not filename:
        return {"success": False, "error": "Missing parameters"}

    url = clean_media_url(raw_url)

    try:
        target_dir = os.path.normpath(target_dir)
        os.makedirs(target_dir, exist_ok=True)
        dest_path = os.path.join(target_dir, filename)

        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://www.instagram.com/",
                "Origin": "https://www.instagram.com",
                "Accept": "*/*"
            }
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            with open(dest_path, "wb") as f:
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    f.write(chunk)

        file_size = os.path.getsize(dest_path)
        return {"success": True, "saved_path": dest_path, "size": file_size}
    except Exception as e:
        return {"success": False, "error": str(e)}

def main():
    while True:
        msg = read_message()
        if msg is None:
            break

        action = msg.get("action")
        if action == "ping":
            send_message({"success": True, "status": "connected"})
        elif action == "choose_directory":
            send_message(handle_choose_directory(msg))
        elif action == "save_file":
            send_message(handle_save_file(msg))
        else:
            send_message({"success": False, "error": f"Unknown action: {action}"})

if __name__ == "__main__":
    main()
