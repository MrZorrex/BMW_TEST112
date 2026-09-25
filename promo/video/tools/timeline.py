# Общий таймлайн ролика (секунды выходного видео). 128 BPM: такт = 1.875 с.
import os

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get("VIDEO_WORK", os.path.join(HERE, "work"))
FRAMES = os.environ.get("FRAMES", os.path.join(WORK, "frames"))
FFMPEG = os.environ.get("FFMPEG", "ffmpeg")
os.makedirs(WORK, exist_ok=True)

FPS = 30
BPM = 128
BEAT = 60 / BPM
BAR = BEAT * 4
W, H = 1920, 1080

# (имя сегмента, старт в ролике, длительность, переход в начале: "cut" | "fade" | "flash")
SEGMENTS = [
    ("s1", 0.0, BAR * 5, "cut"),
    ("s2", BAR * 5, BAR * 2, "fade"),
    ("s3", BAR * 7, BAR * 3.5, "fade"),  # остановка ленты на 16.875 с (такт 9), экран карты до 19.69 с
    ("s4a", BAR * 10 + BEAT * 2, BEAT * 2, "flash"),  # Dixi 1928
    ("s4b", BAR * 11, BEAT * 2, "flash"),  # 507 (1956)
    ("s5", BAR * 11 + BEAT * 2, BEAT * 2 + BAR * 2, "flash"),  # i3 Neue Klasse → финальная карточка на 22.5 с
]
TOTAL = BAR * 14  # 26.25 с
N_FRAMES = int(round(TOTAL * FPS))  # 788 кадров ≈ 26.27 с (последний кадр — хвост финальной карточки)
END_CARD_AT = BAR * 12  # 22.5 с
