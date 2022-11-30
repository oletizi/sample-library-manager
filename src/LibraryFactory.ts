import * as fs from 'fs'
import path from "path"
import {MutableNode, Node} from "./Node"
import {ImmutableNodeMeta} from "./NodeMeta"
import {ImmutableSample} from "./Sample"
import ffprobe, {FFProbeStream} from "ffprobe"
import ffprobeStatic from "ffprobe-static"
import {ImmutableMediaStreamMeta, ImmutableSampleMeta, MediaStreamMeta} from "./SampleMeta"
import {ImmutableLibrary, Library} from "./Library"

export class FileLibraryFactory {
  async newLibrary(rootPath: string, name: string): Promise<Library> {
    return new ImmutableLibrary(name, await new FilesystemDataSource().loadNode(rootPath))
  }
}

interface DataSource {
  loadNode(identifier: string): void
}

class FilesystemDataSource implements DataSource {
  async loadNode(identifier: string): Promise<Node> {
    const supportedTypes: ReadonlySet<string> = new Set(['.aiff', '.aif', '.wav', '.mp3', '.m4a', '.flac'])
    const rootNode = new MutableNode(identifier, path.basename(identifier))
    const nodes: MutableNode[] = [rootNode]
    let currentNode: MutableNode | undefined

    while ((currentNode = nodes.shift()) !== undefined) {
      const files = await fs.promises.readdir(currentNode.path)
      for (let i = 0; i < files.length; i++) {
        // examine each item in the directory
        const filename = files[i]
        const fullpath = path.join(currentNode.path, filename)
        const basename = path.basename(filename)
        const extname = path.extname(basename)
        const stats = await fs.promises.lstat(fullpath)
        if (stats.isDirectory()) {
          // this is a subdirectory
          const child = new MutableNode(fullpath, basename)
          child.parent = currentNode
          currentNode.children.add(child)
          nodes.push(child)
        } else if (basename === 'meta.json') {
          // this is a metadata file
          const m = JSON.parse((await fs.promises.readFile(fullpath)).toString())

          currentNode.meta = new ImmutableNodeMeta(new Set(m.keywords))
        } else if (supportedTypes.has(extname)) {
          // this is a supported audio file
          const keywords = new Set<string>()
          const streams = new Array<MediaStreamMeta>()
          const info = await ffprobe(fullpath, {path: ffprobeStatic.path})
          for (let i = 0; i < info.streams.length; i++) {
            const ffstream: FFProbeStream = info.streams[i]
            const stream = new ImmutableMediaStreamMeta(ffstream)
            streams.push(stream)
          }
          const sampleMeta = new ImmutableSampleMeta(keywords, streams)
          currentNode.samples.add(new ImmutableSample(fullpath, basename, sampleMeta))
        }
      }
    }
    return rootNode
  }
}