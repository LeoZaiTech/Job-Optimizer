import Foundation
import PDFKit

guard CommandLine.arguments.count > 1 else {
  FileHandle.standardError.write(Data("Usage: swift extract-pdf-text.swift <file>\n".utf8))
  exit(64)
}

let filePath = CommandLine.arguments[1]
let fileURL = URL(fileURLWithPath: filePath)

guard let document = PDFDocument(url: fileURL) else {
  FileHandle.standardError.write(Data("Could not open the PDF.\n".utf8))
  exit(1)
}

var pages: [String] = []

for index in 0..<document.pageCount {
  guard let page = document.page(at: index), let text = page.string else {
    continue
  }

  let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
  if !trimmed.isEmpty {
    pages.append(trimmed)
  }
}

let combinedText = pages.joined(separator: "\n\n")
FileHandle.standardOutput.write(Data(combinedText.utf8))
