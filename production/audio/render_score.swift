import Foundation
import AVFoundation

struct Track: Decodable { let name: String; let program: Int; let volume: Float; let pan: Float; let reverb: Float }
struct Event: Decodable { let t: Double; let track: Int; let note: Int; let velocity: Int; let duration: Double }
struct Score: Decodable { let duration: Double; let tracks: [Track]; let events: [Event] }
struct MIDIEvent { let frame: Int64; let track: Int; let note: UInt8; let velocity: UInt8 }
let args = CommandLine.arguments
let score = try JSONDecoder().decode(Score.self, from: Data(contentsOf: URL(fileURLWithPath: args[1])))
let sampleRate: Double = 44100
let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 2)!
let engine = AVAudioEngine()
var samplers: [AVAudioUnitSampler] = []
var nodes: [AVAudioNode] = []
let bank = URL(fileURLWithPath: "/System/Library/Components/CoreAudio.component/Contents/Resources/gs_instruments.dls")
for (i, track) in score.tracks.enumerated() {
    let sampler = AVAudioUnitSampler()
    engine.attach(sampler)
    try sampler.loadSoundBankInstrument(at: bank, program: UInt8(track.program), bankMSB: UInt8(kAUSampler_DefaultMelodicBankMSB), bankLSB: 0)
    let equalizer = AVAudioUnitEQ(numberOfBands: 2)
    engine.attach(equalizer)
    equalizer.bands[0].filterType = .highPass
    equalizer.bands[0].frequency = i == 4 ? 35 : 100
    equalizer.bands[0].bypass = false
    equalizer.bands[1].filterType = .highShelf
    equalizer.bands[1].frequency = 5500
    equalizer.bands[1].gain = -3.5
    equalizer.bands[1].bypass = false
    let reverb = AVAudioUnitReverb()
    reverb.loadFactoryPreset(.largeHall)
    reverb.wetDryMix = track.reverb
    engine.attach(reverb)
    let mixer = AVAudioMixerNode()
    mixer.outputVolume = track.volume
    mixer.pan = track.pan
    engine.attach(mixer)
    engine.connect(sampler, to: equalizer, format: format)
    engine.connect(equalizer, to: reverb, format: format)
    engine.connect(reverb, to: mixer, format: format)
    engine.connect(mixer, to: engine.mainMixerNode, format: format)
    samplers.append(sampler)
    nodes += [equalizer, reverb, mixer]
    print("Loaded track \(i): \(track.name)")
}
engine.mainMixerNode.outputVolume = 0.72
try engine.enableManualRenderingMode(.offline, format: format, maximumFrameCount: 1024)
try engine.start()
var output: AVAudioFile? = try AVAudioFile(forWriting: URL(fileURLWithPath: args[2]), settings: format.settings)
let buffer = AVAudioPCMBuffer(pcmFormat: engine.manualRenderingFormat, frameCapacity: engine.manualRenderingMaximumFrameCount)!
var events: [MIDIEvent] = []
for e in score.events {
    events.append(MIDIEvent(frame: Int64(e.t * sampleRate), track: e.track, note: UInt8(e.note), velocity: UInt8(e.velocity)))
    events.append(MIDIEvent(frame: Int64((e.t + e.duration) * sampleRate), track: e.track, note: UInt8(e.note), velocity: 0))
}
events.sort { $0.frame == $1.frame ? $0.velocity < $1.velocity : $0.frame < $1.frame }
let target = Int64(score.duration * sampleRate)
var current: Int64 = 0
var cursor = 0
var retries = 0
while current < target {
    while cursor < events.count && events[cursor].frame <= current {
        let e = events[cursor]
        if e.velocity == 0 { samplers[e.track].stopNote(e.note, onChannel: 0) }
        else { samplers[e.track].startNote(e.note, withVelocity: e.velocity, onChannel: 0) }
        cursor += 1
    }
    let next = cursor < events.count ? events[cursor].frame : target
    let count = AVAudioFrameCount(min(1024, min(target - current, max(1, next - current))))
    let status = try engine.renderOffline(count, to: buffer)
    switch status {
      case .success:
        try output!.write(from: buffer)
        current += Int64(buffer.frameLength)
        retries = 0
      case .cannotDoInCurrentContext: retries += 1
      case .insufficientDataFromInputNode: retries += 1
      case .error: fatalError("Audio render failed")
      @unknown default: fatalError("Unknown audio render result")
    }
    if retries > 100 { fatalError("Audio renderer stalled") }
}
engine.stop()
output = nil
print("Rendered \(Double(current)/sampleRate) s to \(args[2])")
