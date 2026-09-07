"""Astra — Rooms of Light. Original 65-second score, composed for the gallery tour.
Deterministic, humanized 96 BPM arrangement for system DLS sampled instruments.
Run with Python 3; no external Python packages required for this score generator.
"""
from pathlib import Path
import json, random

rng = random.Random(606706)
BEAT = 60 / 96
BAR = 4 * BEAT
START = .35
out = Path(__file__).parent
tracks = [
    dict(name='Grand piano', program=0, volume=.82, pan=-.09, reverb=24),
    dict(name='Legato string ensemble', program=49, volume=.25, pan=.15, reverb=43),
    dict(name='Warm atmospheric pad', program=89, volume=.19, pan=-.16, reverb=48),
    dict(name='Harp arpeggio', program=46, volume=.34, pan=.32, reverb=31),
    dict(name='Acoustic bass', program=32, volume=.49, pan=0, reverb=12),
    dict(name='Celesta glints', program=8, volume=.20, pan=-.3, reverb=42),
    dict(name='Cello countermelody', program=42, volume=.26, pan=-.27, reverb=35),
]
events = []
def add(track, t, note, dur, vel=65, human=True):
    jitter = rng.uniform(-.009,.012) if human else 0
    events.append(dict(t=round(max(0, t+jitter),5), track=track, note=note,
                       duration=round(dur,5), velocity=max(1,min(127,int(vel+rng.uniform(-3,3))))))

chords = {
 'D':  (38, [50,57,62,66], [62,66,69,73,76], [62,69,74,78]),
 'Bm': (35, [47,54,59,62], [59,62,66,69,73], [59,66,71,74]),
 'G':  (31, [43,50,55,59], [55,59,62,66,69], [59,62,67,74]),
 'A':  (33, [45,52,57,61], [57,61,64,69,71], [61,64,69,73]),
 'F#m':(30, [42,49,54,57], [57,61,66,69,73], [57,64,66,73]),
 'Em': (28, [40,47,52,55], [55,59,64,66,71], [59,64,67,71]),
}
progression=['D','Bm','G','A', 'D','G','Bm','A', 'G','D','Em','A', 'Bm','G','D','A', 'G','D','Em','A', 'Bm','G','A','D']
# Long, singable melodic phrases. A few ninths give the architecture a luminous color.
melody=[
 [(2,69,1.7)],
 [(0,74,1.4),(1.5,78,.9),(2.5,76,.5),(3,74,.8)],
 [(0,74,1.4),(1.5,71,1),(3,69,.8)],
 [(0,73,1.5),(2,76,1.7)],
 [(0,78,1.45),(1.5,81,.9),(2.5,78,.5),(3,76,.8)],
 [(0,74,2.4),(2.5,71,1.2)],
 [(0,74,1),(1.5,78,1),(3,81,.8)],
 [(0,80,1.3),(1.5,76,1),(3,73,.8)],
 [(0,74,1.5),(2,78,.8),(3,81,.8)],
 [(0,81,1.5),(2,78,1.7)],
 [(0,79,1.5),(2,78,.9),(3,76,.8)],
 [(0,76,1.8),(2.5,73,1.1)],
 [(0,78,1),(1.5,81,.9),(2.5,83,1.1)],
 [(0,86,1.45),(1.5,83,.9),(2.5,81,1.1)],
 [(0,81,1.45),(1.5,78,.9),(2.5,76,.5),(3,74,.8)],
 [(0,76,2),(2.5,73,1.1)],
 [(0,74,1.4),(1.5,78,1),(3,81,.8)],
 [(0,81,1.45),(1.5,78,.9),(2.5,76,.5),(3,74,.8)],
 [(0,76,1.4),(1.5,79,1),(3,78,.8)],
 [(0,76,1.5),(2,73,1.6)],
 [(0,74,2),(2.5,78,1.1)],
 [(0,74,2.9)],
 [(0,73,1.4),(1.5,76,.9),(2.5,81,.9)],
 [(0,78,1.3),(1.5,74,4.5)],
]
for bar, name in enumerate(progression):
    t = START + bar*BAR
    root, keys, pad, arp = chords[name]
    intensity = .62 if bar <4 else .79 if bar<8 else .93 if bar<12 else 1.0 if bar<20 else .75 if bar<23 else .60
    # Broken, softly rolled piano voicings; leave room for the lead.
    accompaniment = keys if bar >=4 else keys[1:]
    for j,note in enumerate(accompaniment):
        add(0,t+j*.026,note, 1.72 if bar<23 else 4.5, 48*intensity+8)
    if 4 <=bar <21:
        for j,note in enumerate(keys[1:]):
            add(0,t+2*BEAT+j*.025,note, .88, 42*intensity+8)
    # Close-voiced strings and a quiet open pad sit well above the bass.
    if bar>=2:
        string_notes = pad[:4]
        for j,note in enumerate(string_notes):
            add(1,t+.065+j*.016,note, BAR-.10 if bar<23 else 3.55, 56*intensity)
    if bar in [0,2,4,6,8,10,12,14,16,18,20,22,23]:
        for note in [keys[1],pad[0],pad[2]]:
            add(2,t+.07,note, BAR*1.9 if bar<22 else BAR*.90 if bar==22 else 3.7, 39*intensity+10)
    # Bass emphasizes the architecture of the harmonic rhythm.
    if bar >=4:
        add(4,t+.035,root, BAR-.12 if bar<23 else 4, 59*intensity+9)
        if 12 <=bar<20: add(4,t+2.5*BEAT,root+12,.65,42)
    # Gradually introduce a gentle eighth-note pulse with a sampled harp.
    if 4<=bar<22:
        pattern=[0,2,1,3,0,2,1,3]
        for k,idx in enumerate(pattern):
            if bar<8 and k%2: continue
            vel=39*intensity+(8 if k in (0,4) else 0)
            add(3,t+k*BEAT/2,arp[idx],.62,vel)
    # Celesta illuminates phrase changes without becoming a music-box lead.
    if bar in [4,8,12,16,20,23]:
        for k,note in enumerate([pad[0]+24,pad[2]+24]):
            add(5,t+k*BEAT, note, 2.6, 44 if bar<20 else 34)
    for beat,note,duration in melody[bar]:
        add(0,t+beat*BEAT,note,duration*BEAT,65*intensity+11)
    # Cello answers beneath the piano in the rising middle section.
    if 8<=bar<20:
        celloline=[keys[2],keys[2]+2 if name in ['D','G','Em'] else keys[1]+7]
        add(6,t+.18,celloline[0],1.38,45*intensity)
        add(6,t+2.4*BEAT,celloline[1],.9,40*intensity)

score=dict(title='Astra — Rooms of Light', composer='Original score created for Astra Gallery',
           bpm=96, duration=65.0, key='D major', tracks=tracks, events=sorted(events,key=lambda e:e['t']))
(out/'score.json').write_text(json.dumps(score,indent=2))
print(f'Created {len(events)} note events, {len(tracks)} tracks, {score["duration"]} seconds')
