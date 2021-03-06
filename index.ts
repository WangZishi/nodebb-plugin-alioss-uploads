import OSS from 'ali-oss';
import * as fs from 'fs';
// tslint:disable-next-line:no-implicit-dependencies
import * as n from 'nconf';
import * as path from 'path';
import { URL } from 'url';
import { callbackify, promisify } from 'util';
import { v4 } from 'uuid';

// import * as OSS from 'ali-oss';
// tslint:disable-next-line:no-var-requires
// const OSS = require('ali-oss');

const Package = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

if (!module.parent) {
  throw new Error('Does not use as plugin');
}

const winston = module.parent.require('winston');
const meta = module.parent.require('./meta');
const nconf: typeof n = module.parent.require('nconf');
// const im = gm.subClass({ imageMagick: true });

function makeError(err: string | Error) {
  if (err instanceof Error) {
    err.message = `${Package.name} :: ${err.message}`;
  } else {
    err = new Error(`${Package.name} :: ${err}`);
  }
  // =>
  winston.error(err.message);
  return err;
}

interface IFile {
  path: string;
  name: string;
  size: number;
}
interface IImage extends IFile {
  url: string;
}
type Data<T> = T & { uid: string };
type Exist<T> = { [K in keyof T]: NonNullable<T[K]> };

const settings = {
  accessKeyId: process.env.OSS_ACCESS_KEY_ID || nconf.get('alioss:accessKeyId'),
  bucket: process.env.OSS_UPLOADS_BUCKET || nconf.get('alioss:bucket'),
  host: process.env.OSS_UPLOADS_HOST || nconf.get('alioss:host'),
  path: process.env.OSS_UPLOADS_PATH || nconf.get('alioss:path'),
  region: process.env.OSS_DEFAULT_REGION || nconf.get('alioss:region'),
  secretAccessKey: process.env.OSS_SECRET_ACCESS_KEY || nconf.get('alioss:accessKeySecret'),
};

class OSSPlugin {
  private client: OSS;
  private settings: Exist<typeof settings>;

  constructor() {
    if (!settings.accessKeyId) {
      throw new Error(`Can not find OSS_ACCESS_KEY_ID in ENV`);
    }
    if (!settings.bucket) {
      throw new Error(`Can not find OSS_UPLOADS_BUCKET in ENV`);
    }
    if (!settings.host) {
      throw new Error(`Can not find OSS_UPLOADS_HOST in ENV`);
    }
    if (!settings.path) {
      throw new Error(`Can not find OSS_UPLOADS_PATH in ENV`);
    }
    if (!settings.region) {
      throw new Error(`Can not find OSS_DEFAULT_REGION in ENV`);
    }
    if (!settings.secretAccessKey) {
      throw new Error(`Can not find OSS_SECRET_ACCESS_KEY in ENV`);
    }

    this.settings = settings as any;
    this.client = new OSS({
      accessKeyId: this.settings.accessKeyId,
      accessKeySecret: this.settings.secretAccessKey,
      bucket: this.settings.bucket,
      region: this.settings.region,
    });
  }

  public async activate() {
    this.client = new OSS({
      accessKeyId: this.settings.accessKeyId,
      accessKeySecret: this.settings.secretAccessKey,
      bucket: this.settings.bucket,
      region: this.settings.region,
    });
  }

  public async deactivate() {
    return void 0;
  }

  public async uploadFile(data: Data<{ file: IFile }>) {
    // tslint:disable-next-line: no-console
    console.log('file', { data });
    try {
      if (data.file.size > parseInt(meta.config.maximumFileSize, 10) * 1024) {
        winston.error('error:file-too-big, ' + meta.config.maximumFileSize);
        throw new Error(`[[error:file-too-big, ${meta.config.maximumFileSize}]]`);
      }
      // tslint:disable-next-line:no-console
      console.log(1, this.uploadToOss);
      return await this.uploadToOss(data.file.name, data.file.path);
    } catch (error) {
      throw makeError(error);
    }
  }

  public async uploadImage(data: Data<{ image: IImage }>) {
    // tslint:disable-next-line: no-console
    console.log('image', { data });
    try {
      if (data.image.size > parseInt(meta.config.maximumFileSize, 10) * 1024) {
        winston.error('error:file-too-big, ' + meta.config.maximumFileSize);
        throw new Error(`[[error:file-too-big, ${meta.config.maximumFileSize}]]`);
      }

      const type = data.image.url ? 'url' : 'file';

      if (type === 'file') {
        return await this.uploadToOss(data.image.name, data.image.path);
      } else {
        throw new Error('not implement');
      }
    } catch (error) {
      throw makeError(error);
    }
  }

  private async uploadToOss(filename: string, temp: string) {
    const stats = await promisify(fs.stat)(temp);
    const ossPath = /\/$/.test(this.settings.path) ? this.settings.path : `${this.settings.path}/`;

    const ossKeyPath = ossPath.replace(/^\//, '');

    const objKey = `${ossKeyPath}${v4()}${path.parse(filename).ext}`;

    const result = (await this.client.put(objKey, temp)) as any;
    const ossUrl = new URL(result.url);
    const hostUrl = new URL(this.settings.host);

    hostUrl.pathname = ossUrl.pathname;

    return { name: filename, url: hostUrl.href };
  }
}
const plugin = new OSSPlugin();

module.exports = {
  activate: callbackify(plugin.activate).bind(plugin),
  deactivate: callbackify(plugin.deactivate).bind(plugin),
  uploadFile: callbackify(plugin.uploadFile).bind(plugin),
  uploadImage: callbackify(plugin.uploadImage).bind(plugin),
};
