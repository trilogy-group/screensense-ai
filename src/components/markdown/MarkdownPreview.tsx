import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
const { ipcRenderer } = window.require('electron');
const path = window.require('path');

const MarkdownPreview: React.FC = () => {
  const [content, setContent] = useState('');
  const [basePath, setBasePath] = useState('');

  useEffect(() => {
    // Listen for markdown content updates from the main process
    const handleContentUpdate = (_: any, data: { content: string, basePath: string }) => {
      setContent(data.content);
      setBasePath(data.basePath);
    };

    ipcRenderer.on('markdown-content-update', handleContentUpdate);

    // Request initial content
    ipcRenderer.send('request-markdown-content');

    return () => {
      ipcRenderer.removeListener('markdown-content-update', handleContentUpdate);
    };
  }, []);

  // Custom components for ReactMarkdown
  const components = {
    img: ({ src, alt, ...props }: { src?: string, alt?: string }) => {
      if (!src) return null;
      
      // Convert relative paths to absolute file URLs
      const absoluteSrc = src.startsWith('/')
        ? `file://${src}`
        : `file://${path.join(basePath, src)}`;

      return <img src={absoluteSrc} alt={alt} {...props} style={{ maxWidth: '100%' }} />;
    }
  };

  return (
    <div className="markdown-preview" style={{ padding: '20px', height: '100vh', overflow: 'auto' }}>
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]} 
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownPreview; 