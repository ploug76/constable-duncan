#!/usr/bin/env python3
"""Build art/sprites/atlas.webp + atlas.json from the painted sheets.

Sheets were generated from art/cover.webp so Duncan, the crooks and the
vehicles match the title painting. This script keys out the magenta
backdrop, cuts each figure, and packs a transparent atlas the game blits.

Run from the repo root: python3 tools/build_sprites.py
"""
from __future__ import annotations

import json
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "art" / "sprites" / "src"
OUT = ROOT / "art" / "sprites"

# clip assignment is by figure index, left to right, after a visual check
JOBS = [
    dict(file="duncan-walk-sheet.jpg", n=8, who="duncan", game_h=112, target=230,
         names=["duncan/walk"] * 8),
    dict(file="duncan-run-sheet.jpg", n=8, who="duncan", game_h=112, target=230,
         names=["duncan/run"] * 8),
    dict(file="duncan-extra-sheet.jpg", n=8, who="duncan", game_h=112, target=230,
         names=["duncan/idle", "duncan/idle", "duncan/jump", "duncan/jump",
                "duncan/jump", "duncan/land", "duncan/celebrate", "duncan/hurt"]),
    dict(file="duncan-actions-sheet.jpg", n=4, who="duncan", game_h=112, target=230,
         names=["duncan/point", "duncan/bust", "duncan/blanket", "duncan/hose"]),
    dict(file="crook-walk-sheet.jpg", n=6, who="crook", game_h=102, target=210,
         names=["npc/crook-walk", "npc/crook-walk", "npc/crook-walk",
                "npc/crook-walk", "npc/crook-run", "npc/arson"]),
    dict(file="npc-lineup-sheet.jpg", n=6, who="npc", game_h=100, target=200,
         names=["npc/granny", "npc/kid", "npc/mom", "npc/farmer", "npc/commie", "npc/fire"]),
    dict(file="duncan-cast-sheet.jpg", n=6, who="cast", game_h=100, target=220, absolute=True,
         names=["skip", "skip", "skip", "npc/cloak", "npc/umbrella", "npc/cat"],
         game_h_by={"npc/cloak": 148, "npc/umbrella": 118, "npc/cat": 36},
         anchor_by={"npc/cat": "center"}),
    dict(file="props-sheet.jpg", n=6, who="prop", game_h=80, target=260, absolute=True,
         names=["prop/jeep", "prop/firetruck", "prop/ambulance", "prop/scooter", "prop/hydrant", "prop/boat"],
         game_h_by={"prop/jeep": 64, "prop/firetruck": 120, "prop/ambulance": 84,
                    "prop/scooter": 54, "prop/hydrant": 40, "prop/boat": 68},
         anchor_by={"prop/jeep": "center", "prop/firetruck": "center", "prop/ambulance": "center",
                    "prop/scooter": "center", "prop/boat": "center", "prop/hydrant": "feet"}),
]


def sample_bg(im: Image.Image):
    w, h = im.size
    px = im.load()
    pts = []
    for x in range(0, w, 8):
        pts.append(px[x, 1])
        pts.append(px[x, h - 2])
    for y in range(0, h, 8):
        pts.append(px[1, y])
        pts.append(px[w - 2, y])
    chans = []
    for i in range(3):
        vals = sorted(p[i] for p in pts)
        chans.append(vals[len(vals) // 2])
    return tuple(chans)


def is_magenta(r, g, b, bg):
    dr, dg, db = r - bg[0], g - bg[1], b - bg[2]
    if dr * dr + dg * dg + db * db < 95 * 95:
        return True
    # compressed magenta: red and blue high, green crushed
    if r > 150 and b > 60 and g < 100 and (r - g) > 70 and (b - g) > 15 and r > b - 40:
        return True
    return False


def key_image(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    bg = sample_bg(im)
    w, h = im.size
    px = im.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_magenta(r, g, b, bg):
                px[x, y] = (0, 0, 0, 0)
            else:
                # pull a little pink spill out of the edge colors
                if g < 130 and r > g + 40 and b > g + 10 and r > 140:
                    spill = min(r, b) - g
                    if spill > 25:
                        px[x, y] = (max(0, r - spill // 3), g, max(0, b - spill // 3), 255)
    # second pass: drop opaque specks and pink pixels touching transparency
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            neighbors_clear = 0
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    xx, yy = x + dx, y + dy
                    if xx < 0 or yy < 0 or xx >= w or yy >= h or px[xx, yy][3] == 0:
                        neighbors_clear += 1
            if neighbors_clear >= 5 and (is_magenta(r, g, b, bg) or (r > 170 and g < 90 and b > 70)):
                px[x, y] = (0, 0, 0, 0)
    return im


def components(im: Image.Image, min_area=400):
    """Return figures as masked crops. Fragments whose center sits inside a
    bigger figure (a spare wheel, a handcuff, a ladder rung) are merged in,
    so a bbox overlap with the neighbor never copies the neighbor."""
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    comps = []

    def idx(x, y):
        return y * w + x

    for y in range(h):
        for x in range(w):
            i = idx(x, y)
            if seen[i] or px[x, y][3] < 30:
                continue
            q = deque([(x, y)])
            seen[i] = 1
            pixels = []
            minx = maxx = x
            miny = maxy = y
            while q:
                cx, cy = q.popleft()
                pixels.append((cx, cy))
                if cx < minx: minx = cx
                if cx > maxx: maxx = cx
                if cy < miny: miny = cy
                if cy > maxy: maxy = cy
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if nx < 0 or ny < 0 or nx >= w or ny >= h:
                        continue
                    j = idx(nx, ny)
                    if seen[j] or px[nx, ny][3] < 30:
                        continue
                    seen[j] = 1
                    q.append((nx, ny))
            comps.append(dict(pixels=pixels, minx=minx, maxx=maxx, miny=miny, maxy=maxy, area=len(pixels)))
    comps.sort(key=lambda c: c["area"], reverse=True)
    big = [c for c in comps if c["area"] >= min_area]
    small = [c for c in comps if 80 <= c["area"] < min_area]
    for s in small:
        cx = (s["minx"] + s["maxx"]) / 2
        cy = (s["miny"] + s["maxy"]) / 2
        host = None
        for b in big:
            if b["minx"] - 36 <= cx <= b["maxx"] + 36 and b["miny"] - 36 <= cy <= b["maxy"] + 36:
                host = b
                break
        if host:
            host["pixels"].extend(s["pixels"])
            host["minx"] = min(host["minx"], s["minx"])
            host["maxx"] = max(host["maxx"], s["maxx"])
            host["miny"] = min(host["miny"], s["miny"])
            host["maxy"] = max(host["maxy"], s["maxy"])
            host["area"] += s["area"]
    big.sort(key=lambda c: (c["minx"] + c["maxx"]) / 2)
    cuts = []
    for c in big:
        bw, bh = c["maxx"] - c["minx"] + 1, c["maxy"] - c["miny"] + 1
        crop = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
        cp = crop.load()
        for x, y in c["pixels"]:
            cp[x - c["minx"], y - c["miny"]] = px[x, y]
        cuts.append(trim(crop, 1))
    return cuts


def trim(im: Image.Image, pad=2) -> Image.Image:
    a = im.split()[-1]
    bb = a.getbbox()
    if not bb:
        return im
    x0, y0, x1, y1 = bb
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(im.width, x1 + pad)
    y1 = min(im.height, y1 + pad)
    return im.crop((x0, y0, x1, y1))


def anchors(im: Image.Image, kind: str):
    w, h = im.size
    px = im.load()
    if kind == "center":
        ax, ay = w / 2, h / 2
    else:
        # feet: bottom of the opaque shape, x at the chest so the body
        # doesn't pop, biased toward the supporting foot
        sx = sy = n = 0
        y0, y1 = int(h * 0.22), int(h * 0.62)
        for y in range(y0, y1):
            for x in range(w):
                if px[x, y][3] > 180:
                    sx += x
                    sy += y
                    n += 1
        chest = (sx / n) if n else w / 2
        fx = fy = fn = 0
        for y in range(int(h * 0.82), h):
            for x in range(w):
                if px[x, y][3] > 180:
                    fx += x
                    fy += 1
                    fn += 1
        foot = (fx / fn) if fn else chest
        ax = chest * 0.72 + foot * 0.28
        ay = h - 1
    # hand: rightmost opaque pixel in the arm band (not the boots)
    hx, hy = ax + 10, h * 0.42
    best = -1
    for y in range(int(h * 0.08), int(h * 0.78)):
        for x in range(w - 1, -1, -1):
            if px[x, y][3] > 200:
                if x > best:
                    best = x
                    hx, hy = x, y
                break
    return ax, ay, hx, hy


def extract(job):
    path = SRC / job["file"]
    raw = Image.open(path).convert("RGB")
    keyed = key_image(raw)
    min_area = 2500 if job["who"] == "prop" else 1500
    cuts = components(keyed, min_area=min_area)
    print(f"{job['file']}: {len(cuts)} figures (wanted {job['n']})")
    for i, c in enumerate(cuts):
        print(f"   {i} {c.size}")
    if len(cuts) > job["n"]:
        # keep the n widest figures (drops specks the merge missed)
        order = sorted(range(len(cuts)), key=lambda i: cuts[i].size[0] * cuts[i].size[1], reverse=True)[: job["n"]]
        order.sort()
        cuts = [cuts[i] for i in order]
        print("   kept", len(cuts))
    frames = []
    heights = [c.size[1] for c in cuts] or [1]
    ref_h = sorted(heights)[len(heights) // 2] or 1
    scale = job["target"] / ref_h
    for i, crop in enumerate(cuts[: job["n"]]):
        name = job["names"][i] if i < len(job["names"]) else "skip"
        if name == "skip":
            continue
        nw = max(1, int(round(crop.width * scale)))
        nh = max(1, int(round(crop.height * scale)))
        crop = crop.resize((nw, nh), Image.Resampling.LANCZOS)
        kind = job.get("anchor_by", {}).get(name, "feet" if job["who"] != "prop" else "center")
        ax, ay, hx, hy = anchors(crop, kind)
        gh = job.get("game_h_by", {}).get(name, job["game_h"])
        # Shared character sheets: the median figure is `game_h` units tall
        # and every frame shares that scale, so a crouch stays shorter.
        # Absolute sheets (props, the cloak, the cat): `game_h` is this
        # frame's own height in game units.
        if job.get("absolute"):
            s = gh / crop.height
        else:
            s = gh / job["target"]
        frames.append(dict(clip=name, im=crop, ax=ax, ay=ay, hx=hx, hy=hy, s=s, anchor=kind))
    return frames


def pack(frames, max_w=2048, pad=2):
    x = y = row_h = 0
    placed = []
    for f in frames:
        im = f["im"]
        if x + im.width + pad > max_w:
            x = 0
            y += row_h + pad
            row_h = 0
        f["x"], f["y"] = x, y
        placed.append(f)
        x += im.width + pad
        row_h = max(row_h, im.height)
    W = max_w
    H = y + row_h + pad
    # shrink width to content
    W = max(f["x"] + f["im"].width for f in placed) + pad
    sheet = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for f in placed:
        sheet.paste(f["im"], (f["x"], f["y"]), f["im"])
    return sheet, placed


def montage(frames):
    label_h = 16
    cell_w = 120
    cell_h = 150
    cols = 8
    rows = (len(frames) + cols - 1) // cols
    canvas = Image.new("RGB", (cols * cell_w, rows * (cell_h + label_h)), (32, 28, 40))
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 11)
    except Exception:
        font = ImageFont.load_default()
    for i, f in enumerate(frames):
        r, c = divmod(i, cols)
        ox, oy = c * cell_w, r * (cell_h + label_h)
        im = f["im"]
        scale = min((cell_w - 8) / im.width, (cell_h - 8) / im.height)
        tw, th = max(1, int(im.width * scale)), max(1, int(im.height * scale))
        thumb = im.resize((tw, th), Image.Resampling.LANCZOS)
        canvas.paste(thumb, (ox + (cell_w - tw) // 2, oy + cell_h - th - 2), thumb)
        # anchor cross
        ax = ox + (cell_w - tw) // 2 + int(f["ax"] * scale)
        ay = oy + cell_h - th - 2 + int(f["ay"] * scale)
        draw.line((ax - 3, ay, ax + 3, ay), fill=(255, 220, 40))
        draw.line((ax, ay - 3, ax, ay + 3), fill=(255, 220, 40))
        draw.text((ox + 2, oy + cell_h), f["clip"].split("/")[-1][:16], fill=(255, 230, 160), font=font)
    canvas.save("/tmp/cd-frames/atlas-montage.png")
    print("montage /tmp/cd-frames/atlas-montage.png", canvas.size)


def main():
    frames = []
    for job in JOBS:
        frames.extend(extract(job))
    sheet, placed = pack(frames)
    OUT.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT / "atlas.webp", "WEBP", quality=92, method=6)
    # also a png for browsers that somehow fail webp alpha; the game uses webp
    meta = []
    for i, f in enumerate(placed):
        rot = 0
        if f["clip"] in ("prop/firetruck", "prop/ambulance", "prop/scooter"):
            rot = 3.14159265  # cab / front wheel is the bottom of the art; forward is up
        elif f["clip"] == "prop/jeep":
            rot = 0  # hood and light bar are already the top of the art
        elif f["clip"] == "prop/boat":
            rot = 1.5707963  # bow is the top of the art; the boat faces +x
        meta.append(dict(
            clip=f["clip"], i=i, x=f["x"], y=f["y"], w=f["im"].width, h=f["im"].height,
            ax=round(f["ax"], 2), ay=round(f["ay"], 2),
            hx=round(f["hx"], 2), hy=round(f["hy"], 2),
            s=round(f["s"], 5), anchor=f["anchor"], rot=rot,
        ))
    data = dict(
        image="atlas.webp",
        about="Painted sprites of Constable Duncan, cut from cover-matched sheets. Feet anchor unless anchor is center. s is game-units per pixel.",
        frames=meta,
    )
    (OUT / "atlas.json").write_text(json.dumps(data, indent=1))
    print("atlas", sheet.size, "frames", len(meta), "bytes", (OUT / "atlas.webp").stat().st_size)
    montage(placed)


if __name__ == "__main__":
    main()
