/**
 * Cram — Alexa+ Spoken Voice Exam Coach
 * Web Speech API Voice Controller, Dashboard, & MCP Tool Inspector
 */

(function () {
  'use strict';

  // State Management
  const state = {
    isListening: false,
    isSpeaking: false,
    activeQuizSessionId: null,
    history: [],
    mcpCallsCount: 0
  };

  // DOM Elements
  const micBtn = document.getElementById('micBtn');
  const alexaRing = document.getElementById('alexaRing');
  const alexaStatus = document.getElementById('alexaStatus');
  const transcriptContainer = document.getElementById('transcriptContainer');
  const textInputForm = document.getElementById('textInputForm');
  const userTextInput = document.getElementById('userTextInput');

  // Navigation Tabs
  const tabVoiceBtn = document.getElementById('tabVoiceBtn');
  const tabDashBtn = document.getElementById('tabDashBtn');
  const voiceView = document.getElementById('voiceView');
  const dashView = document.getElementById('dashView');

  // MCP Drawer
  const toggleMcpInspectorBtn = document.getElementById('toggleMcpInspectorBtn');
  const mcpDrawer = document.getElementById('mcpDrawer');
  const closeMcpDrawerBtn = document.getElementById('closeMcpDrawerBtn');
  const clearMcpCallsBtn = document.getElementById('clearMcpCallsBtn');
  const mcpCallsList = document.getElementById('mcpCallsList');
  const mcpCallCountBadge = document.getElementById('mcpCallCount');

  // Dashboard Containers
  const headerStreakText = document.getElementById('headerStreakText');
  const dashStreakValue = document.getElementById('dashStreakValue');
  const dashMinutesValue = document.getElementById('dashMinutesValue');
  const dashExamsCount = document.getElementById('dashExamsCount');
  const dashAvgMastery = document.getElementById('dashAvgMastery');
  const examsListContainer = document.getElementById('examsListContainer');
  const masteryListContainer = document.getElementById('masteryListContainer');
  const todayTasksContainer = document.getElementById('todayTasksContainer');
  const recentQuizzesContainer = document.getElementById('recentQuizzesContainer');
  const regeneratePlanBtn = document.getElementById('regeneratePlanBtn');

  // Modal
  const openAddExamModalBtn = document.getElementById('openAddExamModalBtn');
  const addExamModal = document.getElementById('addExamModal');
  const closeAddExamModal = document.getElementById('closeAddExamModal');
  const cancelAddExamBtn = document.getElementById('cancelAddExamBtn');
  const addExamForm = document.getElementById('addExamForm');

  // Web Audio Context for synthesized Alexa chime
  let audioCtx = null;
  function playChime(type) {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      const now = audioCtx.currentTime;
      if (type === 'start') {
        // Alexa listening chime (cheerful ascending two-tone)
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(880, now + 0.08); // A5
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'stop') {
        // Gentle descending tone
        osc.frequency.setValueAtTime(783.99, now); // G5
        osc.frequency.setValueAtTime(523.25, now + 0.08); // C5
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch (e) {
      // AudioContext optional fallback
    }
  }

  // Web Speech API: Speech Recognition Setup
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      state.isListening = true;
      setOrbState('listening');
      alexaStatus.textContent = "Listening... Speak your exam question or command";
      playChime('start');
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      if (transcript && transcript.trim()) {
        handleUserUtterance(transcript.trim());
      }
    };

    recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
      state.isListening = false;
      setOrbState('idle');
      alexaStatus.textContent = event.error === 'no-speech'
        ? "No speech detected • Tap mic or type below"
        : `Mic status: ${event.error}`;
    };

    recognition.onend = () => {
      state.isListening = false;
      if (!state.isSpeaking && alexaRing.className.includes('listening')) {
        setOrbState('idle');
        alexaStatus.textContent = "Ready • Tap mic or type below";
      }
    };
  } else {
    alexaStatus.textContent = "Web Speech API not supported in this browser • Type below";
  }

  // Toggle Microphone
  function toggleListening() {
    if (!recognition) {
      alert("Speech recognition is not supported in this browser. Please use the text input below.");
      return;
    }

    if (state.isListening) {
      recognition.stop();
      playChime('stop');
      state.isListening = false;
      setOrbState('idle');
      alexaStatus.textContent = "Ready • Tap mic or type below";
    } else {
      // Stop speech synthesis if talking
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      try {
        recognition.start();
      } catch (err) {
        console.warn('Recognition start error:', err);
      }
    }
  }

  micBtn.addEventListener('click', toggleListening);

  // Set Orb Ring Animation State
  function setOrbState(stateName) {
    alexaRing.className = 'alexa-glow-ring';
    if (stateName !== 'idle') {
      alexaRing.classList.add(stateName);
    }
  }

  // Text-To-Speech Output
  function speakResponse(text) {
    if (!('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    // Pick natural voice if available
    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha')));
    if (englishVoice) {
      utterance.voice = englishVoice;
    }

    utterance.onstart = () => {
      state.isSpeaking = true;
      setOrbState('speaking');
      alexaStatus.textContent = "Alexa+ is speaking...";
    };

    utterance.onend = () => {
      state.isSpeaking = false;
      setOrbState('idle');
      alexaStatus.textContent = "Ready • Tap mic or type below";
    };

    utterance.onerror = () => {
      state.isSpeaking = false;
      setOrbState('idle');
      alexaStatus.textContent = "Ready • Tap mic or type below";
    };

    window.speechSynthesis.speak(utterance);
  }

  // Handle User Input (Spoken or Typed)
  async function handleUserUtterance(text) {
    if (!text || !text.trim()) return;

    // Add user message to transcript
    appendTranscriptMessage('user', text);
    userTextInput.value = '';

    setOrbState('processing');
    alexaStatus.textContent = "Thinking & consulting Cram MCP Server...";

    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          utterance: text,
          history: state.history,
          activeQuizSessionId: state.activeQuizSessionId
        })
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || 'Server error');
      }

      const data = await response.json();

      // Check for quiz session id in tool calls
      if (Array.isArray(data.toolCalls)) {
        for (const tc of data.toolCalls) {
          recordMcpCall(tc);

          if (tc.tool === 'start_quiz' && tc.result?.structuredContent?.sessionId) {
            state.activeQuizSessionId = tc.result.structuredContent.sessionId;
          } else if (tc.tool === 'answer_question') {
            if (tc.result?.structuredContent?.isComplete) {
              state.activeQuizSessionId = null;
            }
          } else if (tc.tool === 'end_quiz') {
            state.activeQuizSessionId = null;
          }
        }
      }

      const spokenReply = data.spokenReply || "Action completed.";

      // Add agent reply to transcript
      appendTranscriptMessage('agent', spokenReply);

      // Speak aloud
      speakResponse(spokenReply);

      // Keep history updated (max 10 turns)
      state.history.push({ role: 'user', content: text });
      state.history.push({ role: 'assistant', content: spokenReply });
      if (state.history.length > 10) {
        state.history = state.history.slice(-10);
      }

      // Refresh dashboard in background
      loadDashboardData();

    } catch (err) {
      console.error('Error handling utterance:', err);
      setOrbState('idle');
      alexaStatus.textContent = "Error communicating with MCP server";
      appendTranscriptMessage('agent', `Sorry, I encountered an error: ${err.message}`);
    }
  }

  // Append Message to Transcript UI
  function appendTranscriptMessage(sender, text) {
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${sender}`;

    const senderRow = document.createElement('div');
    senderRow.className = 'message-sender';

    const avatar = document.createElement('span');
    avatar.className = 'sender-avatar';
    avatar.textContent = sender === 'agent' ? '⚡' : '👤';

    const name = document.createElement('span');
    name.className = 'sender-name';
    name.textContent = sender === 'agent' ? 'Cram (Alexa+)' : 'Student';

    const time = document.createElement('span');
    time.className = 'timestamp';
    time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    senderRow.appendChild(avatar);
    senderRow.appendChild(name);
    senderRow.appendChild(time);

    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = text;

    bubble.appendChild(senderRow);
    bubble.appendChild(content);

    if (sender === 'agent') {
      const actions = document.createElement('div');
      actions.className = 'message-actions';
      const replayBtn = document.createElement('button');
      replayBtn.className = 'audio-replay-btn';
      replayBtn.innerHTML = '🔊 Replay voice';
      replayBtn.addEventListener('click', () => speakResponse(text));
      actions.appendChild(replayBtn);
      bubble.appendChild(actions);
    }

    transcriptContainer.appendChild(bubble);
    transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
  }

  // Record MCP Tool Call in Inspector Drawer
  function recordMcpCall(toolCall) {
    state.mcpCallsCount++;
    mcpCallCountBadge.textContent = state.mcpCallsCount;

    // Remove empty state if present
    const emptyState = mcpCallsList.querySelector('.empty-calls-state');
    if (emptyState) {
      emptyState.remove();
    }

    const card = document.createElement('div');
    card.className = 'mcp-call-card';

    const header = document.createElement('div');
    header.className = 'mcp-call-header';

    const toolBadge = document.createElement('span');
    toolBadge.className = 'mcp-tool-badge';
    toolBadge.textContent = `tool: ${toolCall.tool}`;

    const latency = document.createElement('span');
    latency.className = 'mcp-call-latency';
    latency.textContent = `${toolCall.durationMs || 12}ms`;

    header.appendChild(toolBadge);
    header.appendChild(latency);

    const argsBlock = document.createElement('pre');
    argsBlock.className = 'mcp-code-block';
    argsBlock.textContent = `Args: ${JSON.stringify(toolCall.arguments, null, 2)}`;

    const resultBlock = document.createElement('pre');
    resultBlock.className = 'mcp-code-block';
    resultBlock.textContent = `Result: ${JSON.stringify(toolCall.result, null, 2)}`;

    card.appendChild(header);
    card.appendChild(argsBlock);
    card.appendChild(resultBlock);

    mcpCallsList.insertBefore(card, mcpCallsList.firstChild);
  }

  // Clear Inspector Drawer
  clearMcpCallsBtn.addEventListener('click', () => {
    state.mcpCallsCount = 0;
    mcpCallCountBadge.textContent = '0';
    mcpCallsList.innerHTML = `
      <div class="empty-calls-state">
        <div class="empty-icon">🔌</div>
        <p>No MCP calls made yet.</p>
        <span>Ask Alexa+ a question or trigger a quiz to inspect live JSON-RPC tool calls.</span>
      </div>
    `;
  });

  // Drawer Toggle Handlers
  toggleMcpInspectorBtn.addEventListener('click', () => {
    mcpDrawer.classList.toggle('open');
  });

  closeMcpDrawerBtn.addEventListener('click', () => {
    mcpDrawer.classList.remove('open');
  });

  // Tab Switching
  tabVoiceBtn.addEventListener('click', () => {
    tabVoiceBtn.classList.add('active');
    tabDashBtn.classList.remove('active');
    voiceView.classList.add('active');
    dashView.classList.remove('active');
  });

  tabDashBtn.addEventListener('click', () => {
    tabDashBtn.classList.add('active');
    tabVoiceBtn.classList.remove('active');
    dashView.classList.add('active');
    voiceView.classList.remove('active');
    loadDashboardData();
  });

  // Form Submit (Text Input)
  textInputForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = userTextInput.value.trim();
    if (val) {
      handleUserUtterance(val);
    }
  });

  // Quick Prompt Chips
  document.querySelectorAll('.prompt-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const promptText = chip.getAttribute('data-text');
      if (promptText) {
        handleUserUtterance(promptText);
      }
    });
  });

  // Load Dashboard Data
  async function loadDashboardData() {
    try {
      const res = await fetch('/api/dashboard');
      if (!res.ok) return;
      const data = await res.json();

      // Top Metrics
      headerStreakText.textContent = `${data.streak} Day Streak`;
      dashStreakValue.textContent = data.streak;
      dashMinutesValue.textContent = data.totalMinutes;
      dashExamsCount.textContent = data.exams.length;

      // Calculate Average Mastery
      if (data.topics && data.topics.length > 0) {
        const avg = Math.round(data.topics.reduce((a, b) => a + b.mastery_score, 0) / data.topics.length);
        dashAvgMastery.textContent = `${avg}%`;
      } else {
        dashAvgMastery.textContent = '0%';
      }

      // Render Exams
      examsListContainer.innerHTML = '';
      if (data.exams.length === 0) {
        examsListContainer.innerHTML = '<p class="text-muted" style="padding: 10px;">No upcoming exams yet.</p>';
      } else {
        data.exams.forEach((exam) => {
          const card = document.createElement('div');
          card.className = 'exam-card';

          let countdownClass = 'countdown-safe';
          let daysText = `in ${exam.daysLeft} days`;
          if (exam.daysLeft <= 3) {
            countdownClass = 'countdown-urgent';
            daysText = exam.daysLeft <= 0 ? 'Today' : `${exam.daysLeft} day${exam.daysLeft === 1 ? '' : 's'} left!`;
          } else if (exam.daysLeft <= 7) {
            countdownClass = 'countdown-soon';
            daysText = `${exam.daysLeft} days left`;
          }

          card.innerHTML = `
            <div>
              <div class="exam-subject">${exam.subject}</div>
              <div class="exam-date-sub">📅 ${exam.exam_date} • ${exam.topic_count} topics</div>
            </div>
            <div class="exam-countdown-pill ${countdownClass}">
              ${daysText}
            </div>
          `;
          examsListContainer.appendChild(card);
        });
      }

      // Render Spaced Repetition Mastery Bars
      masteryListContainer.innerHTML = '';
      if (data.topics.length === 0) {
        masteryListContainer.innerHTML = '<p class="text-muted" style="padding: 10px;">No topics registered.</p>';
      } else {
        data.topics.forEach((t) => {
          const row = document.createElement('div');
          row.className = 'mastery-row';

          let fillClass = 'fill-weak';
          if (t.mastery_score >= 70) fillClass = 'fill-mastered';
          else if (t.mastery_score >= 40) fillClass = 'fill-medium';

          row.innerHTML = `
            <div class="mastery-meta">
              <div>
                <span class="mastery-tag">${t.subject}</span>
                <span class="mastery-topic-title">${t.name}</span>
              </div>
              <span class="mastery-percent">${t.mastery_score}%</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill ${fillClass}" style="width: ${Math.max(5, t.mastery_score)}%;"></div>
            </div>
          `;
          masteryListContainer.appendChild(row);
        });
      }

      // Render Today's Study Tasks
      todayTasksContainer.innerHTML = '';
      let hasTasks = false;
      if (data.todayPlans && data.todayPlans.length > 0) {
        data.todayPlans.forEach((plan) => {
          if (plan.tasks && plan.tasks.length > 0) {
            hasTasks = true;
            plan.tasks.forEach((task, idx) => {
              const item = document.createElement('div');
              item.className = 'task-item';
              item.innerHTML = `
                <input type="checkbox" class="task-checkbox" id="task_${plan.exam_id}_${idx}" ${task.completed ? 'checked' : ''} />
                <div class="task-details">
                  <div class="task-header">
                    <span class="task-topic-name">${task.topic} (${plan.subject})</span>
                    <span class="task-duration-badge">⏱️ ${task.minutes} min</span>
                  </div>
                  <div class="task-goal">${task.goal}</div>
                </div>
              `;
              todayTasksContainer.appendChild(item);
            });
          }
        });
      }

      if (!hasTasks) {
        todayTasksContainer.innerHTML = `
          <div style="padding: 16px; text-align: center; color: var(--text-muted);">
            No scheduled tasks for today. Tap <strong>↻ Refresh Plan</strong> to generate one.
          </div>
        `;
      }

      // Render Recent Quizzes
      recentQuizzesContainer.innerHTML = '';
      if (!data.recentQuizzes || data.recentQuizzes.length === 0) {
        recentQuizzesContainer.innerHTML = `
          <div style="padding: 16px; text-align: center; color: var(--text-muted);">
            No quizzes taken yet. Say "Quiz me on graph theory" to test your recall!
          </div>
        `;
      } else {
        data.recentQuizzes.forEach((q) => {
          const item = document.createElement('div');
          item.className = 'quiz-history-item';
          const scoreClass = q.average_score >= 70 ? 'countdown-safe' : (q.average_score >= 40 ? 'countdown-soon' : 'countdown-urgent');
          const dateStr = new Date(q.started_at).toLocaleDateString([], { month: 'short', day: 'numeric' });
          item.innerHTML = `
            <div>
              <div style="font-weight: 600; color: #fff;">${q.topic_name || 'General Quiz'} (${q.subject})</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">📅 ${dateStr} • ${q.total_questions} questions</div>
            </div>
            <div class="quiz-score-pill ${scoreClass}">
              ${Math.round(q.average_score)}%
            </div>
          `;
          recentQuizzesContainer.appendChild(item);
        });
      }

    } catch (e) {
      console.warn('Dashboard load error:', e);
    }
  }

  // Regenerate Plan Button
  regeneratePlanBtn.addEventListener('click', () => {
    handleUserUtterance('Make me a study plan for DSGT');
  });

  // Modal Dialogs
  openAddExamModalBtn.addEventListener('click', () => {
    addExamModal.classList.add('open');
  });

  closeAddExamModal.addEventListener('click', () => {
    addExamModal.classList.remove('open');
  });

  cancelAddExamBtn.addEventListener('click', () => {
    addExamModal.classList.remove('open');
  });

  addExamForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const subject = document.getElementById('examSubjectInput').value.trim();
    const examDate = document.getElementById('examDateInput').value;
    const topicsRaw = document.getElementById('examTopicsInput').value.trim();

    if (subject && examDate) {
      addExamModal.classList.remove('open');
      const utterance = topicsRaw
        ? `Add my ${subject} exam on ${examDate} with topics ${topicsRaw}`
        : `Add my ${subject} exam on ${examDate}`;
      handleUserUtterance(utterance);
      addExamForm.reset();
    }
  });

  // Spacebar to toggle microphone
  window.addEventListener('keydown', (e) => {
    // Only toggle if not currently typing in an input
    if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      toggleListening();
    }
  });

  // Initial load
  loadDashboardData();

})();
