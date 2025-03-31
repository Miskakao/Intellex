// Multi-page navigation functions
function showPage(pageId) {
    document.querySelectorAll('.multi-page-container').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageId).classList.add('active');
}

// Theme toggle function
function toggleTheme() {
    document.body.classList.toggle('light-mode');
    document.body.classList.toggle('dark-mode');
    const currentMode = document.body.classList.contains('light-mode') ? 'light' : 'dark';
    localStorage.setItem('preferredTheme', currentMode);
}

// API Key functions
function saveApiKey() {
    const apiKey = document.getElementById('apiKeyInput').value.trim();
    if (apiKey) {
        localStorage.setItem('googleAIStudioApiKey', apiKey);
        // Immediately verify the API key
        verifyApiKey(apiKey);
    } else {
        alert('Prosím zadejte platný API klíč');
    }
}

async function verifyApiKey(apiKey) {
    const testPrompt = 'Hello, can you confirm this is a valid API key?';
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: testPrompt
                    }]
                }]
            })
        });

        if (response.ok) {
            // Key is valid
            showPage('fileUploadPage');
            return true;
        } else {
            // Key is invalid
            localStorage.removeItem('googleAIStudioApiKey');
            openSettingsModal();
            alert('Neplatný API klíč. Zkuste to znovu.');
            return false;
        }
    } catch (error) {
        console.error('Chyba ověření API klíče:', error);
        localStorage.removeItem('googleAIStudioApiKey');
        openSettingsModal();
        alert('Nepodařilo se ověřit API klíč. Zkontrolujte připojení k internetu.');
        return false;
    }
}

// PDF extraction function
async function extractTextFromPDF(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const typedArray = new Uint8Array(e.target.result);
                const pdf = await pdfjsLib.getDocument(typedArray).promise;
                let fullText = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(' ');
                    fullText += pageText + '\n';
                }
                resolve(fullText);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
}

// Quiz generation functions
const API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
let generatedQuestions = [];

async function fetchQuizFromAI(prompt, apiKey) {
    try {
        const response = await fetch(`${API_ENDPOINT}?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }]
            })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
        }

        const data = await response.json();
        const responseText = data.candidates[0].content.parts[0].text;
        return parseQuizResponse(responseText);
    } catch (error) {
        console.error('Detailní chyba:', error);
        throw error;
    }
}

function parseQuizResponse(responseText) {
    const questions = [];
    // Split by double newline, but ensure we're dealing with actual question blocks
    const questionBlocks = responseText.split('\n\n').filter(block =>
        block.trim() !== '' && block.includes('Otázka:'));

    questionBlocks.forEach(block => {
        const lines = block.split('\n');
        const questionLine = lines.find(line => line.trim().startsWith('Otázka:'));

        if (questionLine) {
            const question = questionLine.replace('Otázka:', '').trim();

            // Check for multiple choice options
            const options = lines.filter(line => /^[A-D]:/.test(line.trim()));
            const hasOptions = options.length > 0;

            // Find the correct answer line regardless of question type
            const correctAnswerLine = lines.find(line =>
                line.trim().startsWith('Správná odpověď:') ||
                line.trim().startsWith('Správná možnost:') ||
                line.trim().startsWith('Správná volba:') ||
                line.trim().startsWith('Vzorová odpověď:') ||
                line.trim().startsWith('Možná odpověď:'));

            if (correctAnswerLine) {
                // For multiple choice questions
                if (hasOptions) {
                    // Extract just the letter of the correct answer
                    const answerMatch = correctAnswerLine.match(/[A-D]/);
                    const correctAnswer = answerMatch ? answerMatch[0] : '';

                    if (correctAnswer) {
                        questions.push({
                            question,
                            options,
                            correctAnswer,
                            type: 'multiple'
                        });
                    }
                }
                // For open-ended questions
                else {
                    let correctAnswer = correctAnswerLine
                        .replace(/Správná odpověď:|Vzorová odpověď:|Možná odpověď:|Správná možnost:|Správná volba:/, '')
                        .trim();

                    // Remove any incorrect format like "B:" from open-ended answers
                    correctAnswer = correctAnswer.replace(/^[A-D]:\s*/, '');

                    questions.push({
                        question,
                        correctAnswer,
                        type: 'open'
                    });
                }
            }
        }
    });

    return questions;
}

function generateQuizPrompt(content, quizType, questionCount, difficulty) {
    const difficultyPrompts = {
        'easy': {
            guide: 'Připrav jednoduché otázky, které přímo vycházejí z textu.',
            complexity: 'Otázky by měly být jasné a srozumitelné, s dostatečně zřetelnými informacemi pro zodpovězení.'
        },
        'medium': {
            guide: 'Připrav středně těžké otázky, které vyžadují hlubší pochopení kontextu.',
            complexity: 'Otázky by měly vyžadovat propojení informací a mírnou interpretaci textu.'
        },
        'hard': {
            guide: 'Připrav těžké otázky, které jdou nad rámec pouhého doslovného výkladu textu.',
            complexity: 'Vyžaduj kritické myšlení, schopnost analyzovat skryté významy a komplexní souvislosti.'
        }
    };

    const difficultySettings = difficultyPrompts[difficulty];
    let promptTemplate = '';

    if (quizType === 'multiple') {
        promptTemplate = `${difficultySettings.guide} ${difficultySettings.complexity} Vygeneruj ${questionCount} ${difficulty} multiple choice otázek s 4 možnostmi A-D. Formátuj každou otázku přesně takto:
            Otázka: [text otázky]
            A: [možnost A]
            B: [možnost B]
            C: [možnost C]
            D: [možnost D]
            Správná odpověď: [písmeno správné odpovědi - pouze A, B, C nebo D]

            Text: ${content}`;
    } else if (quizType === 'open') {
        promptTemplate = `${difficultySettings.guide} ${difficultySettings.complexity} Vygeneruj ${questionCount} ${difficulty} otázek s volnou odpovědí. Formátuj každou otázku přesně takto:
            Otázka: [text otázky]
            Správná odpověď: [vzorová odpověď]

            DŮLEŽITÉ: U otázek s volnou odpovědí NIKDY nepoužívej možnosti A, B, C, D. Text vzorové odpovědi by měl začínat přímo po "Správná odpověď:" bez jakýchkoliv písmen před textem.

            Text: ${content}`;
    } else if (quizType === 'mixed') {
        promptTemplate = `${difficultySettings.guide} ${difficultySettings.complexity} Vygeneruj ${questionCount} ${difficulty} otázek buď s 4 možnostmi A-D, nebo s volnou odpovědí. Pro krátké a stručné odpovědi použij možnosti A-D, pro rozsáhlejší a složitější odpovědi použji vlnou odpověď, ale vždy musí být od obou typů otázek minimálně jedna.
            Pro otázky s výběrem možností použij tento formát:
            Otázka: [text otázky]
            A: [možnost A]
            B: [možnost B]
            C: [možnost C]
            D: [možnost D]
            Správná odpověď: [písmeno správné odpovědi - pouze A, B, C nebo D]

            Pro otázky s volnou odpovědí použij tento formát:
            Otázka: [text otázky]
            Správná odpověď: [vzorová odpověď]

            DŮLEŽITÉ: U otázek s volnou odpovědí NIKDY nepoužívej možnosti A, B, C, D. Vzorová odpověď by měla začínat přímo po "Správná odpověď:" bez jakýchkoliv písmen před textem.

            Text: ${content}`;
    }

    return promptTemplate;
}

async function generateQuiz() {
    const generateBtn = document.getElementById('generateQuizBtn');
    generateBtn.classList.add('loading');

    const file = document.getElementById('documentUpload').files[0];
    // Get the data type from the selected button
    const quizType = document.querySelector('.selector-btn[data-type].selected').dataset.type;
    const questionCount = parseInt(document.getElementById('questionCount').value);
    const apiKey = localStorage.getItem('googleAIStudioApiKey');
    // Get the difficulty from the selected button
    const difficulty = document.querySelector('.selector-btn[data-difficulty].selected').dataset.difficulty;

    try {
        if (!apiKey) {
            alert('Prosím zadejte API klíč');
            return;
        } else if (!file) {
            alert('Prosím nahrajte soubor');
            return;
        }

        const fileContent = await extractTextFromPDF(file);
        const prompt = generateQuizPrompt(fileContent, quizType, questionCount, difficulty);

        const response = await fetchQuizFromAI(prompt, apiKey);
        displayQuizQuestions(response);

        showPage('quizPage');
    } catch (error) {
        console.error('Chyba:', error);
        alert(`Nepodařilo se vygenerovat kvíz: ${error.message}`);
    } finally {
        generateBtn.classList.remove('loading');
    }
}

async function evaluateOpenEndedAnswer(question, correctAnswer, userAnswer, apiKey) {
    if (!userAnswer)
        return {
            type: 'spatna',
            comment: 'Otázka nebyla zodpovězena.',
            score: 0,
        };

    const prompt = `Proveď vyhodnocení odpovědi na následující otázku:
        Otázka: ${question}
        Vzorová odpověď: ${correctAnswer}
        Odpověď uživatele: ${userAnswer}

        Vyhodnoť odpověď podle následujících kritérií:
        1. Obsahuje klíčové body správné odpovědi?
        2. Je věcně správná?
        3. Chybí nějaké důležité informace?

        Formátuj odpověď přesně takto:
        Typ: [spravna/castecne_spravna/spatna]
        Komentář: [pro odpovědi typu spravna: Vše splněno; pro odpovědi typu castecne_spravna: velmi stručný seznam klíčových bodů, které nebyly zmíněny; pro odpovědi typu spatna: velmi stručný seznam klíčových bodů, kvůli kterým je odpověď špatná]
        Hodnocení: [číslo s přesností na jednu desetinu v rozmezí 0 až 1]`;

    try {
        const response = await fetch(`${API_ENDPOINT}?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }]
            })
        });

        if (!response.ok) {
            throw new Error('Nepodařilo se vyhodnotit odpověď');
        }

        const data = await response.json();
        const responseText = data.candidates[0].content.parts[0].text;

        // Parse the AI's evaluation
        const typeMatch = responseText.match(/Typ:\s*(spravna|castecne_spravna|spatna)/i);
        const commentMatch = responseText.match(/Komentář:\s*\[?(.*?)\]?(?=\n|$)/s);
        const scoreMatch = responseText.match(/Hodnocení:\s*\[?(.*?)\]?(?=\n|$)/s);

        return {
            type: typeMatch ? typeMatch[1].toLowerCase() : 'spatna',
            comment: commentMatch ? commentMatch[1].trim() : 'Nepodařilo se vyhodnotit',
            score: scoreMatch && !isNaN(scoreMatch[1]) ? Number(scoreMatch[1].trim()) : -1,
        };
    } catch (error) {
        console.error('Chyba při vyhodnocování:', error);
        return {
            type: 'spatna',
            comment: 'Chyba při vyhodnocování',
            score: -1,
        };
    }
}

async function submitQuiz() {
    const submitBtn = document.querySelector('#quizPage .btn');
    submitBtn.classList.add('loading');

    try {
        const resultsContainer = document.getElementById('quizResults');
        resultsContainer.innerHTML = '';
        const apiKey = localStorage.getItem('googleAIStudioApiKey');

        let correctAnswers = 0;
        const totalQuestions = generatedQuestions.length;

        // Async evaluation for all questions
        const evaluationPromises = generatedQuestions.map(async (q, index) => {
            if (q.type === 'multiple') {
                const selectedOption = document.querySelector(`input[name="question${index}"]:checked`);
                const isCorrect = selectedOption && selectedOption.value.split(':')[0].trim() === q.correctAnswer.trim();
                if (isCorrect) correctAnswers++;

                const resultElement = document.createElement('div');
                resultElement.classList.add('question');
                resultElement.classList.add(selectedOption ? (isCorrect ? 'correct' : 'incorrect') : 'incorrect');

                // Find the text of the correct option
                const correctOptionText = q.options.find(opt => opt.trim().startsWith(q.correctAnswer + ':'));
                const formattedCorrectText = correctOptionText ? correctOptionText.trim() : 'Chyba: Nelze najít správnou odpověď';
                const userOptionText = selectedOption ? selectedOption.value.trim() : 'Neodpovězeno';

                // HERE
                resultElement.innerHTML = `
                    <div class="question-title">
                        <div class="question-number-content">${index + 1}. ${q.question}</div>
                        <div class="score-indicator">${userOptionText == formattedCorrectText ? '1' : '0'}</div>
                    </div>
                    <div class="question-options">
                    ${q.options.map((opt, optIndex) => `
                        <div class="question-option-result ${formattedCorrectText == opt.trim() ? 'correct' : (userOptionText == opt.trim() ? 'incorrect' : '')}">
                        <label for="q${index}opt${optIndex}">${opt}</label>
                        </div>
                    `).join('')}
                    </div>`;

                return resultElement;
            } else {
                const userAnswer = document.getElementById(`openAnswer${index}`).value;

                // Evaluate open-ended answer
                const evaluation = await evaluateOpenEndedAnswer(
                    q.question,
                    q.correctAnswer,
                    userAnswer,
                    apiKey
                );

                const resultElement = document.createElement('div');
                resultElement.classList.add('question');

                // Determine result class based on evaluation
                if (evaluation.score == -1) {
                    resultElement.classList.add('error');
                } else if (evaluation.type === 'spravna') {
                    resultElement.classList.add('correct');
                    correctAnswers++;
                } else if (evaluation.type === 'castecne_spravna') {
                    resultElement.classList.add('semicorrect');
                    correctAnswers += evaluation.score;
                } else {
                    resultElement.classList.add('incorrect');
                }

                resultElement.innerHTML = `
                    <div class="question-title">
                        <div class="question-number-content">${index + 1}. ${q.question}</div>
                        <div class="score-indicator">${evaluation.score != -1 ? evaluation.score : '∅'}</div>
                    </div>
                    <div class="result-content">
                        <p class="question-text"><strong>Vaše odpověď: </strong>${userAnswer || 'Neodpovězeno'}</p>
                        ${evaluation.type !== 'spravna' ? `
                        <p class="question-text"><strong>Vzorová odpověď: </strong>${q.correctAnswer}</p>
                        <p class="question-note">${evaluation.comment}</p>
                        ` : ''}
                    </div>`;

                return resultElement;
            }
        });

        const resultElements = await Promise.all(evaluationPromises);

        // Now add all the question results
        resultElements.forEach(element => resultsContainer.appendChild(element));

        // Create the results animation container and append it at the end
        const animationContainer = document.createElement('div');
        animationContainer.className = 'results-animation';
        animationContainer.innerHTML = `
            <div class="question">
            <div class="result-content">
                <div class="percentage-container">
                    <div class="percentage" id="percentage">0%</div>
                    <div class="result-message" id="result-message">Loading result...</div>
                </div>

                <div class="progress-container">
                    <div class="label-container">
                    <div>0%</div>
                    <div>100%</div>
                    </div>
                    <div class="progress-bar-bg">
                    <div class="progress-bar" id="progress-bar"></div>
                    </div>
                    <div class="glow" id="glow"></div>
                </div>
            </div>
            </div>`;

        resultsContainer.appendChild(animationContainer);

        // Calculate and animate the progress
        const successPercentage = Math.round((correctAnswers / totalQuestions) * 100);
        showPage('resultPage');

        // Trigger the animation after a short delay
        setTimeout(() => {
            animateProgressBar(successPercentage);
        }, 300);

    } catch (error) {
        console.error('Chyba při odevzdávání kvízu:', error);
        alert('Nastala chyba při odevzdávání kvízu');
    } finally {
        submitBtn.classList.remove('loading');
    }
}

function displayQuizQuestions(questions) {
    generatedQuestions = questions;
    const questionsContainer = document.getElementById('quizQuestions');
    questionsContainer.innerHTML = '';

    questions.forEach((q, index) => {
        const questionElement = document.createElement('div');
        questionElement.classList.add('question');

        if (q.type === 'multiple') {
            questionElement.innerHTML = `
                <div class="question-title">${index + 1}. ${q.question}</div>
                <div class="question-options">
                ${q.options.map((opt, optIndex) => `
                    <div class="question-option" onclick="selectOption(this, 'question${index}')">
                    <input type="radio" name="question${index}" id="q${index}opt${optIndex}" value="${opt}" style="display: none;">
                    <label for="q${index}opt${optIndex}">${opt}</label>
                    </div>
                `).join('')}
                </div>`;
        } else {
            questionElement.innerHTML = `
                <div class="question-title">${index + 1}. ${q.question}</div>
                <textarea class="open-answer-textarea" id="openAnswer${index}" placeholder="Zde napište svou odpověď"></textarea>`;
        }

        questionsContainer.appendChild(questionElement);
    });
}

function selectOption(optionElement, radioGroupName) {
    const options = optionElement.parentNode.querySelectorAll('.question-option');
    options.forEach(opt => {
        opt.classList.remove('selected');
        opt.querySelector('input[type="radio"]').checked = false;
    });

    optionElement.classList.add('selected');
    optionElement.querySelector('input[type="radio"]').checked = true;
}

// Function to save the current state
function saveQuizState() {
    const difficulty = document.querySelector('.selector-btn[data-difficulty].selected').dataset.difficulty;
    const quizType = document.querySelector('.selector-btn[data-type].selected').dataset.type;
    const questionCount = document.getElementById('questionCount').value;

    localStorage.setItem('quizState', JSON.stringify({
        difficulty,
        quizType,
        questionCount
    }));
}

// Function to restore the last state
function restoreQuizState() {
    const savedState = localStorage.getItem('quizState');
    const savedApiKey = localStorage.getItem('googleAIStudioApiKey');

    if (savedState) {
        const { difficulty, quizType, questionCount } = JSON.parse(savedState);

        // Restore difficulty
        const difficultyButtons = document.querySelectorAll('.selector-btn[data-difficulty]');
        difficultyButtons.forEach(btn => {
            btn.classList.remove('selected');
            if (btn.dataset.difficulty === difficulty) {
                btn.classList.add('selected');
            }
        });

        // Restore quiz type
        const quizTypeButtons = document.querySelectorAll('.selector-btn[data-type]');
        quizTypeButtons.forEach(btn => {
            btn.classList.remove('selected');
            if (btn.dataset.type === quizType) {
                btn.classList.add('selected');
            }
        });

        // Restore question count
        document.getElementById('questionCount').value = questionCount;
    }

    // Check API key
    if (savedApiKey) {
        // Pre-fill API key in settings
        if (document.getElementById('apiKeySettings')) {
            document.getElementById('apiKeySettings').value = savedApiKey;
        }
        // Implicit verification on page load
        verifyApiKey(savedApiKey);
    } else {
        // If no API key is saved, show settings modal
        setTimeout(() => openSettingsModal(), 500);
    }
}

// Add event listeners for saving state
document.addEventListener('DOMContentLoaded', () => {
    // Restore last state
    restoreQuizState();

    // Initialize the floating selectors
    initFloatingSelectors();

    // Add event listeners for saving state
    const difficultyButtons = document.querySelectorAll('.selector-btn[data-difficulty]');
    const quizTypeButtons = document.querySelectorAll('.selector-btn[data-type]');
    const questionCountInput = document.getElementById('questionCount');

    difficultyButtons.forEach(button => {
        button.addEventListener('click', () => {
            difficultyButtons.forEach(btn => btn.classList.remove('selected'));
            button.classList.add('selected');
            saveQuizState();
        });
    });

    quizTypeButtons.forEach(button => {
        button.addEventListener('click', () => {
            quizTypeButtons.forEach(btn => btn.classList.remove('selected'));
            button.classList.add('selected');
            saveQuizState();
        });
    });

    questionCountInput.addEventListener('change', saveQuizState);

    // File input handling
    const fileInput = document.getElementById('documentUpload');
    const fileNameDisplay = document.getElementById('fileName');

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            fileNameDisplay.textContent = e.target.files[0].name;
        } else {
            fileNameDisplay.textContent = '';
        }
    });

    // Add drag and drop functionality
    const fileInputWrapper = document.querySelector('.file-input-wrapper');

    fileInputWrapper.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileInputWrapper.classList.add('drag-over');
    });

    fileInputWrapper.addEventListener('dragleave', () => {
        fileInputWrapper.classList.remove('drag-over');
    });

    fileInputWrapper.addEventListener('drop', (e) => {
        e.preventDefault();
        fileInputWrapper.classList.remove('drag-over');

        if (e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.type === 'application/pdf') {
                fileInput.files = e.dataTransfer.files;
                fileNameDisplay.textContent = file.name;
            } else {
                alert('Prosím nahrajte PDF soubor');
            }
        }
    });

    window.addEventListener('resize', () => {
        const selectorGroups = document.querySelectorAll('.selector-buttons');
        selectorGroups.forEach(group => {
            const selected = group.querySelector('.selector-btn.selected');
            const background = group.querySelector('.selector-background');
            if (selected && background) {
                positionBackground(background, selected);
            }
        });
    });
});

function openSettingsModal() {
    const settingsModal = document.querySelector('.settings-modal');
    settingsModal.classList.add('active');

    // Populate existing API key
    const savedApiKey = localStorage.getItem('googleAIStudioApiKey');
    document.getElementById('apiKeySettings').value = savedApiKey || '';

    // Set theme switch
    const themeSwitch = document.getElementById('themeSwitch');
    themeSwitch.checked = document.body.classList.contains('dark-mode');
}

async function closeSettingsModal() {
    const settingsModal = document.querySelector('.settings-modal');
    settingsModal.classList.add('closing');
    settingsModal.classList.remove('active');

    setTimeout(() => {
        settingsModal.classList.remove('closing');
    }, 300);
}

function toggleThemeSwitch(isDark) {
    document.body.classList.remove('light-mode', 'dark-mode');
    document.body.classList.add(isDark ? 'dark-mode' : 'light-mode');
    localStorage.setItem('preferredTheme', isDark ? 'dark' : 'light');
}

async function saveApiKeyFromSettings() {
    const btn = document.querySelector('#saveApiKey');
    btn.classList.add('loading');

    const apiKey = document.getElementById('apiKeySettings').value.trim();
    if (apiKey) {
        const isValid = await verifyApiKey(apiKey);
        if (isValid) {
            localStorage.setItem('googleAIStudioApiKey', apiKey);
        }
    } else {
        alert('Prosím zadejte platný API klíč');
    }

    btn.classList.remove('loading');
}

function initFloatingSelectors() {
    const selectorGroups = document.querySelectorAll('.selector-buttons');

    selectorGroups.forEach(group => {
        // Create and append floating background element
        const background = document.createElement('div');
        background.className = 'selector-background';

        // Set initial vertical centering
        background.style.top = '50%';
        background.style.transform = 'translateY(-50%)';

        group.appendChild(background);

        // Find the initially selected button
        const initialSelected = group.querySelector('.selector-btn.selected');
        if (initialSelected) {
            // Position the background beneath the selected button
            positionBackground(background, initialSelected);
        }

        // Add click handlers to all buttons in this group
        const buttons = group.querySelectorAll('.selector-btn');
        buttons.forEach(button => {
            button.addEventListener('click', function () {
                // Remove selected class from all buttons and add to clicked one
                buttons.forEach(btn => btn.classList.remove('selected'));
                this.classList.add('selected');

                // Animate the background to the new position
                positionBackground(background, this);

                // Call your existing selector functions if needed
                if (this.dataset.difficulty) {
                    saveQuizState();
                } else if (this.dataset.type) {
                    saveQuizState();
                }
            });
        });
    });
}

function positionBackground(background, targetElement) {
    // Set the width and left position of the background to match the target button
    background.style.width = targetElement.offsetWidth + 'px';
    background.style.left = targetElement.offsetLeft + 'px';

    // Ensure the background remains vertically centered
    // (not strictly necessary if using transform: translateY(-50%), but provides a fallback)
    background.style.top = '50%';
    background.style.transform = 'translateY(-50%)';
}

function animateProgressBar(percentage) {
    const progressBar = document.getElementById('progress-bar');
    const glow = document.getElementById('glow');
    const percentageText = document.getElementById('percentage');
    const resultMessage = document.getElementById('result-message');

    // Reset to initial state
    progressBar.style.width = '0%';
    glow.style.width = '0%';
    percentageText.textContent = '0%';

    // Apply the correct color based on percentage
    let barColor;
    if (percentage >= 90) {
        barColor = 'var(--correct-color)';
        resultMessage.textContent = "Výborně!";
    } else if (percentage >= 75) {
        barColor = '#4caf50'; // Green
        resultMessage.textContent = "Jen tak dál!";
    } else if (percentage >= 50) {
        barColor = 'var(--semicorrect-color)'; // Orange
        resultMessage.textContent = "Dobrá práce!";
    } else {
        barColor = 'var(--incorrect-color)'; // Red
        resultMessage.textContent = "Nepřestávej procvičovat!";
    }

    progressBar.style.backgroundColor = barColor;

    // Precisely control the animation timing
    const duration = 1500; // 1.5 seconds total
    const startTime = performance.now();

    const animate = (currentTime) => {
        const elapsedTime = currentTime - startTime;
        const progress = Math.min(elapsedTime / duration, 1);

        // Improved easing function for smoother animation
        // Using cubic bezier approximation for better timing
        const easedProgress = cubicEaseInOut(progress);

        const currentValue = Math.round(percentage * easedProgress);

        // Update all elements simultaneously
        progressBar.style.width = currentValue + '%';
        glow.style.width = currentValue + '%';
        percentageText.textContent = currentValue + '%';

        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    };

    requestAnimationFrame(animate);
}

// Improved easing function
function cubicEaseInOut(t) {
    return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Load theme preference on page load
window.addEventListener('load', () => {
    const savedTheme = localStorage.getItem('preferredTheme');
    if (savedTheme) {
        document.body.classList.remove('light-mode', 'dark-mode');
        document.body.classList.add(`${savedTheme}-mode`);
    }

    // Add event listener to close settings modal when clicking outside
    const settingsModal = document.querySelector('.settings-modal');
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            closeSettingsModal();
        }
    });

    // File name display
    document.getElementById('documentUpload').addEventListener('change', function (e) {
        const fileName = e.target.files[0] ? e.target.files[0].name : '';
        document.getElementById('fileName').textContent = fileName;
    });

    // Theme button selector
    const difficultyButtons = document.querySelectorAll('[data-difficulty]');
    const quizTypeButtons = document.querySelectorAll('[data-type]');

    difficultyButtons.forEach(button => {
        button.addEventListener('click', () => {
            difficultyButtons.forEach(btn => btn.classList.remove('selected'));
            button.classList.add('selected');
        });
    });

    quizTypeButtons.forEach(button => {
        button.addEventListener('click', () => {
            quizTypeButtons.forEach(btn => btn.classList.remove('selected'));
            button.classList.add('selected');
        });
    });
});