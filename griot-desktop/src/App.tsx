import { useState, FormEvent } from 'react';
import './index.css';

interface Message {
  id: number;
  author: 'User' | 'Griot';
  text: string;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, author: 'Griot', text: 'Griot Local Cognitive Engine ready. How can I assist you with your GenOS tasks today?' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now(),
      author: 'User',
      text: inputValue
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsProcessing(true);

    // Mock processing for Griot response
    setTimeout(() => {
      const griotMessage: Message = {
        id: Date.now() + 1,
        author: 'Griot',
        text: `Processing local cognitive task for: "${userMessage.text}". Using local models in isolation as per security rules.`
      };
      setMessages(prev => [...prev, griotMessage]);
      setIsProcessing(false);
    }, 1500);
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>Griot</h1>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Local Cognitive Node</span>
      </header>
      
      <main className="chat-container">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.author.toLowerCase()}`}>
            <div className="message-author">{msg.author}</div>
            <div className="message-content">{msg.text}</div>
          </div>
        ))}
        {isProcessing && (
          <div className="message griot">
            <div className="message-author">Griot</div>
            <div className="message-content" style={{ color: 'var(--text-muted)' }}>
              Computing...
            </div>
          </div>
        )}
      </main>

      <form className="input-container" onSubmit={handleSubmit}>
        <input 
          type="text" 
          placeholder="Ask Griot..." 
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={isProcessing}
        />
        <button type="submit" disabled={isProcessing || !inputValue.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

export default App;
