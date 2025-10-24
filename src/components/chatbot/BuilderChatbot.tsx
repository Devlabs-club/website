import React, { useState } from "react";

export default function BuilderChatbot() {
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState("");

  const questions = [
    "Hey there 👋 What’s your full name?",
    "Cool! Which university are you studying at?",
    "And what’s your major or specialization?"
  ];

  const next = () => {
    if (step < questions.length - 1) {
      setStep(step + 1);
      setAnswer("");
    }
  };

  const back = () => {
    if (step > 0) {
      setStep(step - 1);
      setAnswer("");
    }
  };

  return (
    <div className="w-full max-w-2xl bg-neutral-900/70 border border-dashed border-neutral-700 rounded-2xl shadow-lg p-8 backdrop-blur-md text-white">
      <h1 className="text-3xl font-semibold text-orange-500 mb-6 text-center">
        Builder Onboarding Chat
      </h1>

      <div className="mb-6">
        <p className="text-lg font-medium">{questions[step]}</p>
        <input
          type="text"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Type your answer here..."
          className="mt-4 w-full p-3 rounded-lg bg-neutral-800 border border-neutral-700 text-white placeholder-gray-500 focus:ring-2 focus:ring-orange-500 outline-none transition-all"
        />
      </div>

      <div className="flex justify-between mt-6">
        <button
          onClick={back}
          disabled={step === 0}
          className="px-5 py-2 border border-neutral-700 rounded-lg hover:bg-neutral-800 disabled:opacity-50 transition-colors"
        >
          Back
        </button>
        <button
          onClick={next}
          disabled={answer.trim() === ""}
          className={`px-5 py-2 rounded-lg font-medium transition-colors ${
            answer.trim() === ""
              ? "bg-orange-900 opacity-60 cursor-not-allowed"
              : "bg-orange-500 hover:bg-orange-600 text-black"
          }`}
        >
          {step === questions.length - 1 ? "Finish" : "Next"}
        </button>
      </div>
    </div>
  );
}
