/**
 * Trình phát audio khoá tua — dùng cho câu Nghe khi làm ở chế độ "Thi thử"
 * (exam), đúng luật thi thật của IELTS/TOEIC/JLPT: audio chỉ phát được một
 * lần, không có thanh tua kéo được, không phát lại sau khi đã nghe xong.
 *
 * Cố ý chỉ có một nút "Phát" (không có Tạm dừng) — ngoài đời hầu hết các kỳ
 * thi Nghe cũng không cho tạm dừng giữa chừng, nên bớt một trạng thái là bớt
 * một cách để "gian lận" giờ nghe mà không mất tính năng thật nào.
 *
 * Chế độ luyện tập (practice) vẫn dùng `<audio controls>` gốc của trình
 * duyệt — tua/nghe lại tự do có lợi cho việc học, không cần khoá.
 */

import { icon } from "./icons";
import { esc } from "./bindActions";

/** Trạng thái đã nghe xong hay chưa, tra theo số câu — engine gọi giữ ở Runtime. */
export function renderLockedAudioPlayer(questionN: number, url: string, played: boolean): string {
  if (!url) return "";
  const id = `lockedAudio-${questionN}`;
  return `<div class="locked-audio" data-locked-audio="${id}">
    <audio preload="none" src="${esc(url)}" data-locked-audio-el></audio>
    <div class="locked-audio-row">
      ${
        played
          ? `<div class="locked-audio-done" aria-hidden="true">${icon("checkCircle")}</div>`
          : `<button class="locked-audio-play" type="button" data-locked-audio-play aria-label="Phát audio bài nghe">${icon("play")}</button>`
      }
      <div class="locked-audio-body">
        <div class="bar thin"><i style="width:${played ? 100 : 0}%" data-locked-audio-bar></i></div>
        <div class="locked-audio-status" data-locked-audio-status>
          ${
            played
              ? `${icon("checkCircle")}<span>Đã nghe xong — không thể phát lại</span>`
              : `${icon("info")}<span>Audio chỉ phát một lần, không thể tua lại — bấm Phát khi đã sẵn sàng</span>`
          }
        </div>
      </div>
    </div>
  </div>`;
}

/**
 * Gắn sự kiện thật cho player vừa render. Gọi sau khi đã chèn HTML vào DOM.
 *
 * `onLocked` được gọi ngay khi trình duyệt xác nhận audio bắt đầu phát —
 * không đợi tới lúc phát xong. Lý do: mỗi lần trạng thái bài thi đổi (chọn
 * đáp án, chuyển câu...) toàn bộ màn hình được vẽ lại từ đầu (kiến trúc
 * chung của app), nên phần tử `<audio>` đang phát có thể bị huỷ giữa chừng
 * bất cứ lúc nào. Khoá lượt nghe ngay khi bấm Phát (thay vì chờ sự kiện
 * `ended`) vừa khớp đúng tinh thần "chỉ một lượt nghe", vừa tránh việc bấm
 * Phát — chuyển câu ngay — quay lại để "làm mới" audio và nghe lại từ đầu.
 */
export function bindLockedAudioPlayer(root: ParentNode, questionN: number, onLocked: () => void): void {
  const id = `lockedAudio-${questionN}`;
  const wrap = root.querySelector<HTMLElement>(`[data-locked-audio="${id}"]`);
  if (!wrap) return;
  const audio = wrap.querySelector<HTMLAudioElement>("[data-locked-audio-el]");
  const playBtn = wrap.querySelector<HTMLButtonElement>("[data-locked-audio-play]");
  const bar = wrap.querySelector<HTMLElement>("[data-locked-audio-bar]");
  const status = wrap.querySelector<HTMLElement>("[data-locked-audio-status]");
  if (!audio || !playBtn) return;

  let started = false;

  playBtn.addEventListener("click", () => {
    if (started) return;
    started = true;
    playBtn.disabled = true;
    audio
      .play()
      .then(() => {
        // Đã thực sự bắt đầu phát — dùng lượt nghe của câu này ngay từ đây.
        onLocked();
        playBtn.remove();
        if (status) status.innerHTML = `${icon("volume")}<span>Đang phát — không thể tạm dừng hay tua lại.</span>`;
      })
      .catch(() => {
        started = false;
        playBtn.disabled = false;
        if (status) status.innerHTML = `${icon("alert")}<span>Không phát được audio — kiểm tra kết nối mạng rồi thử lại.</span>`;
      });
  });

  audio.addEventListener("timeupdate", () => {
    if (bar && audio.duration) bar.style.width = `${Math.min(100, (audio.currentTime / audio.duration) * 100)}%`;
  });

  audio.addEventListener("ended", () => {
    if (bar) bar.style.width = "100%";
    if (status) status.innerHTML = `${icon("checkCircle")}<span>Đã nghe xong — không thể phát lại</span>`;
  });
}
