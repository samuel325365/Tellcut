// Text in still images for Tellcut on macOS (toolkit phase 5), with Apple's built-in Vision text recognition (nothing to install).
// Built once by packages/media-node/src/providers/ocr-macos.ts with swiftc into .cache/bin/, then:
//   ocr-vision --list <file with one image path per line> [--lang zh-Hant,en-US]
//   ocr-vision --supports zh-Hant          prints True or False
// One JSON line per image, as tools/ps/ocr.ps1 writes: {"image","width","height","lines":[{"text","box":[x,y,w,h]}]} (pixels, top left).
import Foundation
import ImageIO
import Vision

struct Line: Encodable { let text: String; let box: [Int] }
struct Result: Encodable { let image: String; let width: Int; let height: Int; let lines: [Line] }

func fail(_ msg: String) -> Never {
  FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
  exit(1)
}

func arg(_ name: String) -> String? {
  let a = CommandLine.arguments
  guard let i = a.firstIndex(of: name), i + 1 < a.count else { return nil }
  return a[i + 1]
}

func request(_ langs: [String]) -> VNRecognizeTextRequest {
  let r = VNRecognizeTextRequest()
  r.recognitionLevel = .accurate
  r.usesLanguageCorrection = true
  r.recognitionLanguages = langs
  return r
}

if let lang = arg("--supports") {
  let supported = (try? request([]).supportedRecognitionLanguages()) ?? []
  print(supported.contains(lang) ? "True" : "False")
  exit(0)
}

guard let list = arg("--list") else { fail("usage: ocr-vision --list <file> [--lang zh-Hant,en-US]") }
let langs = (arg("--lang") ?? "zh-Hant,en-US").split(separator: ",").map(String.init)
guard let text = try? String(contentsOfFile: list, encoding: .utf8) else { fail("cannot read \(list)") }
let encoder = JSONEncoder()

for path in text.split(whereSeparator: \.isNewline).map(String.init) where !path.trimmingCharacters(in: .whitespaces).isEmpty {
  guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
        let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { fail("cannot open \(path)") }
  let w = img.width, h = img.height, req = request(langs)
  do { try VNImageRequestHandler(cgImage: img, options: [:]).perform([req]) } catch { fail("\(path): \(error.localizedDescription)") }
  let lines: [Line] = (req.results ?? []).compactMap { o in
    guard let top = o.topCandidates(1).first else { return nil }
    // Vision's box is a fraction of the picture with its origin at the bottom left
    let b = o.boundingBox
    let x = Int((b.minX * Double(w)).rounded()), y = Int(((1 - b.maxY) * Double(h)).rounded())
    return Line(text: top.string, box: [x, y, Int((b.width * Double(w)).rounded()), Int((b.height * Double(h)).rounded())])
  }
  let data = try! encoder.encode(Result(image: path, width: w, height: h, lines: lines))
  print(String(data: data, encoding: .utf8)!)
}
