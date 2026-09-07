"""Add restrained original percussion and master the rendered original score.
Requires numpy and FFmpeg; no network, samples, or third-party music used.
"""
from pathlib import Path
import json, subprocess, numpy as np

HERE=Path(__file__).parent
FFMPEG='/opt/homebrew/bin/ffmpeg'
SR=44100
DURATION=65
rng=np.random.default_rng(550184)

def run(cmd):
    return subprocess.run(cmd,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)

raw=run([FFMPEG,'-v','error','-i',str(HERE/'instruments.wav'),'-f','f32le','-ac','2','-ar',str(SR),'-']).stdout
music=np.frombuffer(raw,dtype='<f4').reshape(-1,2).copy()
music*=3.0
perc=np.zeros_like(music)

def place(signal,t,amp,pan=0):
    i=round(t*SR)
    n=min(len(signal),len(perc)-i)
    if n<=0:return
    angle=(pan+1)*np.pi/4
    perc[i:i+n,0]+=signal[:n]*(amp*np.cos(angle))
    perc[i:i+n,1]+=signal[:n]*(amp*np.sin(angle))

def kick():
    t=np.arange(int(.65*SR))/SR
    phase=2*np.pi*(48*t+24*.026*(1-np.exp(-t/.026)))
    env=(1-np.exp(-t/.002))*np.exp(-t/.16)
    return np.sin(phase)*env+.17*np.sin(2*np.pi*108*t)*np.exp(-t/.022)

def brush():
    n=int(.08*SR);t=np.arange(n)/SR
    noise=rng.normal(0,1,n)
    spec=np.fft.rfft(noise);f=np.fft.rfftfreq(n,1/SR)
    spec*=np.minimum(1,(f/4800)**3)*np.exp(-(f/12500)**4)
    sound=np.fft.irfft(spec,n)
    return sound*np.exp(-t/.018)*(1-np.exp(-t/.001))

def rim():
    t=np.arange(int(.17*SR))/SR
    tone=np.sin(2*np.pi*820*t)+.7*np.sin(2*np.pi*1236*t)+.25*np.sin(2*np.pi*2450*t)
    return tone*np.exp(-t/.014)*(1-np.exp(-t/.0008))

beat=60/96
for bar in range(8,21):
    base=.35+bar*4*beat
    energy=.62 if bar<12 else .86 if bar<16 else 1 if bar<20 else .46
    place(kick(),base,.043*energy)
    if bar<20:place(kick(),base+2.5*beat,.023*energy)
    place(rim(),base+2*beat,.014*energy,-.18)
    for j in range(8):
        amp=.0052*energy*(.75 if j%2==0 else 1.0)*rng.uniform(.75,1)
        place(brush(),base+j*beat/2+rng.uniform(-.007,.007),amp,.45 if j%2 else -.38)
# Small room on percussion keeps the pulse integrated, with no big snare hits.
for sec,gain in [(0.071,.12),(0.127,.08),(0.193,.04)]:
    offset=int(sec*SR)
    perc[offset:]+=perc[:-offset,::-1]*gain
mix=music+perc
# A quiet, diffuse stereo halo carries the ending.
for sec,gain in [(0.293,.016),(0.419,.013)]:
    offset=int(sec*SR)
    mix[offset:]+=music[:-offset,::-1]*gain
# Smoothly land in true silence while allowing the last chord to resolve.
time=np.arange(len(mix))/SR
fadein=np.sin(np.minimum(time/.22,1)*np.pi/2)**2
fadeout=np.cos(np.clip((time-61.0)/4.0,0,1)*np.pi/2)**2
mix*=fadein[:,None]*fadeout[:,None]
mix=np.tanh(mix*1.08)/1.08
rawpath=HERE/'premaster.f32'
mix.astype('<f4').tofile(rawpath)
base=[FFMPEG,'-hide_banner','-y','-f','f32le','-ar',str(SR),'-ac','2','-i',str(rawpath)]
analysis=run(base+['-af','highpass=f=30,loudnorm=I=-18:TP=-1.2:LRA=11:print_format=json','-f','null','-']).stderr.decode()
start=analysis.rfind('{')
measure=json.loads(analysis[start:analysis.find('}',start)+1])
(HERE/'loudness-analysis.json').write_text(json.dumps(measure,indent=2))
settings=f"highpass=f=30,loudnorm=I=-18:TP=-1.2:LRA=11:measured_I={measure['input_i']}:measured_TP={measure['input_tp']}:measured_LRA={measure['input_lra']}:measured_thresh={measure['input_thresh']}:offset={measure['target_offset']}:linear=true:print_format=summary"
output=HERE/'astra-rooms-of-light.wav'
metadata=['-metadata','title=Astra — Rooms of Light','-metadata','artist=Original score for Astra Gallery','-metadata','comment=Original instrumental composition; 96 BPM; D major; 65 seconds.']
result=run(base+['-af',settings,'-ar',str(SR),'-c:a','pcm_s24le']+metadata+[str(output)])
print(result.stderr.decode().split('Output Integrated:')[-1])
run([FFMPEG,'-v','error','-y','-i',str(output),'-c:a','libmp3lame','-b:a','256k']+metadata+[str(HERE/'astra-rooms-of-light.mp3')])
run([FFMPEG,'-v','error','-y','-i',str(output),'-c:a','aac','-b:a','192k','-movflags','+faststart']+metadata+[str(HERE/'astra-rooms-of-light.m4a')])
rawpath.unlink()
print('Delivered WAV (24-bit), MP3 (256 kb/s), M4A (192 kb/s)')
