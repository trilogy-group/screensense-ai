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
    const handleContentUpdate = (_: any, data: { content: string; basePath: string }) => {
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
    img: ({ src, alt, ...props }: { src?: string; alt?: string }) => {
      if (!src) return null;

      // Convert relative paths to absolute file URLs
      const absoluteSrc = src.startsWith('/')
        ? `file://${src}`
        : `file://${path.join(basePath, src)}`;

      return <img src={absoluteSrc} alt={alt} {...props} style={{ maxWidth: '100%' }} />;
    },
  };

  return (
    <div
      className="markdown-preview"
      style={{
        height: '100vh',
        overflow: 'auto',
        backgroundColor: '#ffffff',
        color: '#2c3e50',
      }}
    >
      <div
        style={{
          padding: '40px',
          margin: '0 auto',
          fontSize: '16px',
          lineHeight: '1.6',
          fontFamily:
            'Segoe UI, -apple-system, BlinkMacSystemFont, system-ui, Roboto, Arial, sans-serif',
        }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={components}
          children={content}
          className="markdown-content"
        />
      </div>
      <style>{`
        .markdown-content h1 {
          color: #1a365d;
          font-size: 2.5em;
          margin-bottom: 1em;
          padding-bottom: 0.5em;
          border-bottom: 2px solid #e2e8f0;
        }
        .markdown-content h2 {
          color: #2c5282;
          font-size: 1.8em;
          margin-top: 1.5em;
          margin-bottom: 0.8em;
        }
        .markdown-content h3 {
          color: #2b6cb0;
          font-size: 1.4em;
          margin-top: 1.2em;
        }
        .markdown-content p {
          margin: 1em 0;
          color: #2d3748;
        }
        .markdown-content a {
          color: #3182ce;
          text-decoration: none;
        }
        .markdown-content a:hover {
          text-decoration: underline;
        }
        .markdown-content code {
          background-color: #f7fafc;
          padding: 0.2em 0.4em;
          border-radius: 3px;
          font-family: 'Cascadia Code', 'Consolas', 'Monaco', 'SFMono-Regular', 'Liberation Mono', 'Menlo', monospace;
          font-size: 0.9em;
          color: #805ad5;
        }
        .markdown-content pre {
          background-color: #f8f9fa;
          padding: 1em;
          border-radius: 6px;
          overflow-x: auto;
          border: 1px solid #e2e8f0;
        }
        .markdown-content pre code {
          background-color: transparent;
          padding: 0;
          color: #2d3748;
        }
        .markdown-content blockquote {
          border-left: 4px solid #e2e8f0;
          margin: 1em 0;
          padding-left: 1em;
          color: #4a5568;
        }
        .markdown-content ul, .markdown-content ol {
          margin: 1em 0;
          padding-left: 2em;
          color: #2d3748;
        }
        .markdown-content img {
          border-radius: 6px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          margin: 1.5em 0;
        }
        .markdown-content table {
          border-collapse: collapse;
          width: 100%;
          margin: 1em 0;
        }
        .markdown-content th, .markdown-content td {
          border: 1px solid #e2e8f0;
          padding: 0.75em;
          text-align: left;
        }
        .markdown-content th {
          background-color: #f7fafc;
          font-weight: 600;
        }
        .markdown-content tr:nth-child(even) {
          background-color: #f9fafb;
        }
      `}</style>
    </div>
  );
};

export default MarkdownPreview;
