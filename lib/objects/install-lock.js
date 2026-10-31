const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// A materialized files-only checkout has no Git index. Hash its exact file tree
// without following symlinks so the lock can detect later local modifications.
function contentHash(root){
  const digest = crypto.createHash('sha256');
  const pending = [''];
  const chunk = Buffer.allocUnsafe(64 * 1024);
  while(pending.length){
    const relative = pending.pop();
    const directory = path.join(root, relative);
    const names = fs.readdirSync(directory).filter(name => relative !== '' || name !== '.git').sort();
    for(let i = names.length - 1; i >= 0; i--){
      const name = names[i];
      const child = path.join(relative, name);
      const file = path.join(root, child);
      const stat = fs.lstatSync(file);
      const normalized = child.split(path.sep).join('/');
      if(stat.isDirectory()){
        digest.update('D\0' + normalized + '\0');
        pending.push(child);
      }else if(stat.isSymbolicLink()){
        digest.update('L\0' + normalized + '\0' + fs.readlinkSync(file) + '\0');
      }else if(stat.isFile()){
        digest.update('F\0' + normalized + '\0' + stat.size + '\0');
        const fd = fs.openSync(file, 'r');
        try {
          let count;
          while((count = fs.readSync(fd, chunk, 0, chunk.length, null)) > 0){
            digest.update(chunk.subarray(0, count));
          }
        } finally { fs.closeSync(fd); }
      }else{
        throw new Error('unsupported file in Git checkout: ' + file);
      }
    }
  }
  return digest.digest('hex');
}

module.exports = {contentHash};
