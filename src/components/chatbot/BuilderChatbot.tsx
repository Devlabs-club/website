import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";

const logo = "/logo.svg";


export default function BuilderChatbot() {
  const [messages, setMessages] = useState<
    { sender: "bot" | "user"; text: string }[]
  >([]);
  const [input, setInput] = useState("");
  const [step, setStep] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const chatFlow = [
    "Hey there 👋 I’m DevBot from DevLabs — what’s your full name?",
    "Nice to meet you! Which university are you studying at?",
    "Awesome. And what’s your major or specialization?",
    "Got it! Thanks for sharing — your onboarding is complete 🎉",
  ];


  useEffect(() => {
  if (chatContainerRef.current) {
    chatContainerRef.current.scrollTo({
      top: chatContainerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }
}, [messages]);



  useEffect(() => {
    if (messages.length === 0) {
      setIsTyping(true);
      setTimeout(() => {
        setMessages([{ sender: "bot", text: chatFlow[0] }]);
        setIsTyping(false);
      }, 400);
    }
  }, []);

  const handleSend = () => {
    if (!input.trim()) return;

    const userMsg = { sender: "user", text: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

   
    if (step < chatFlow.length - 1) {
      setIsTyping(true);
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          { sender: "bot", text: chatFlow[step + 1] },
        ]);
        setStep(step + 1);
        setIsTyping(false);
      }, 1000);
    }
  };

  return (
    <div className="w-full max-w-2xl h-[600px] flex flex-col bg-neutral-900/70 border border-dashed border-neutral-700 rounded-2xl shadow-lg p-6 backdrop-blur-md text-white overflow-hidden">

      <h1 className="text-2xl font-semibold text-orange-500 mb-4 text-center">
        DevBot — Builder Onboarding
      </h1>

      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-thin scrollbar-thumb-neutral-700 scroll-smooth"
      >

        {messages.map((msg, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={`flex items-end ${
              msg.sender === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {msg.sender === "bot" && (
              <img
                src={logo}
                alt="DevBot"
                className="w-8 h-8 rounded-full mr-2 border border-neutral-700"
              />
            )}
            <div
              className={`px-4 py-2 rounded-2xl max-w-[80%] text-sm ${
                msg.sender === "bot"
                  ? "bg-neutral-800 text-gray-200 border border-neutral-700"
                  : "bg-orange-500 text-black font-medium"
              }`}
            >
              {msg.text}
            </div>
          </motion.div>
        ))}

        {isTyping && (
          <div className="flex items-center text-sm text-gray-400 mt-2">
            <img
              src={logo}
              alt="DevBot"
              className="w-6 h-6 rounded-full mr-2 border border-neutral-700"
            />
            <motion.span
              initial={{ opacity: 0.4 }}
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 1 }}
            >
              DevBot is typing...
            </motion.span>
          </div>
        )}
        
      </div>

      <form
        onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex mt-4 space-x-2 sticky bottom-0 bg-neutral-900/70 backdrop-blur-md pb-2 pt-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your answer..."
            className="flex-1 p-3 rounded-lg bg-neutral-800 border border-neutral-700 text-white placeholder-gray-500 focus:ring-2 focus:ring-orange-500 outline-none transition-all"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className={`px-5 py-2 rounded-lg font-medium transition-colors ${
              input.trim()
                ? "bg-orange-500 hover:bg-orange-600 text-black"
                : "bg-orange-900 opacity-60 cursor-not-allowed"
            }`}
          >
            Send
          </button>
        </form>

        

    </div>
  );
}
