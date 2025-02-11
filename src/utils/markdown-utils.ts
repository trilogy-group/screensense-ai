const { ipcRenderer } = window.require('electron');

export const openMarkdownPreview = (filePath: string) => {
  ipcRenderer.send('open-markdown-preview', filePath);
};

export const isMarkdownFile = (filePath: string) => {
  return filePath.toLowerCase().endsWith('.md') || filePath.toLowerCase().endsWith('.markdown');
};
