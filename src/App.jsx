import React, { useState } from 'react';
import { FileText, Upload, Download, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import mammoth from 'mammoth';

const GoalTrackerGenerator = () => {
  const [files, setFiles] = useState({
    transcript: null,
    treehouseTracker: null,
    goalInfo: null
  });
  const [textInputs, setTextInputs] = useState({
    transcriptText: '',
    goalInfoText: ''
  });
  const [useTextInput, setUseTextInput] = useState({
    transcript: false,
    goalInfo: false
  });
  const [processing, setProcessing] = useState(false);
  const [output, setOutput] = useState(null);
  const [error, setError] = useState(null);

  const handleFileUpload = async (fileType, file) => {
    setFiles(prev => ({ ...prev, [fileType]: file }));
    setError(null);
  };

  const extractTextFromDocx = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    } catch (err) {
      throw new Error(`Error reading ${file.name}: ${err.message}`);
    }
  };

  const parseTreehouseTracker = (text) => {
    const tasks = {
      reading: { task: '', complete: false, notes: '' },
      writing: { task: '', complete: false, notes: '' },
      computation: { task: '', complete: false, notes: '' },
      communication: { task: '', complete: false, notes: '' },
      observation: { task: '', complete: false, notes: '' },
      ctws: { task: '', complete: false, notes: '' }
    };

    const lines = text.split('\n');
    let currentStudent = '';
    let studentColumn = -1;
    let headerFound = false;
    
    // First pass: find student name and their column position
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for student names in header row (often in a table format)
      if (line.includes('Student') || /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(line)) {
        const names = line.split(/\t|\|/).map(s => s.trim()).filter(Boolean);
        // Store all potential student names for later matching
        currentStudent = names[0];
        headerFound = true;
      }
    }

    // Second pass: extract tasks and completion status
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lowerLine = line.toLowerCase();
      
      // Skip empty lines
      if (!line.trim()) continue;

      // Detect task rows by looking for subject keywords
      let taskType = null;
      let taskDescription = '';
      let isComplete = false;

      if (lowerLine.includes('reading') || lowerLine.includes('lexia')) {
        taskType = 'reading';
      } else if (lowerLine.includes('writing') || lowerLine.includes('typing')) {
        taskType = 'writing';
      } else if (lowerLine.includes('computation') || lowerLine.includes('zearn') || lowerLine.includes('reflex') || lowerLine.includes('math')) {
        taskType = 'computation';
      } else if (lowerLine.includes('communication')) {
        taskType = 'communication';
      } else if (lowerLine.includes('observation')) {
        taskType = 'observation';
      } else if (lowerLine.includes('ctws') || lowerLine.includes('ct/ws') || lowerLine.includes('ct ws')) {
        taskType = 'ctws';
      }

      if (taskType) {
        // Extract task description (everything before completion marker)
        const parts = line.split(/[✓✔☑]/);
        taskDescription = parts[0].trim();
        
        // Check for completion markers
        isComplete = /[✓✔☑]/.test(line) || 
                    line.includes('[x]') || 
                    line.includes('[X]') ||
                    /\s+x\s+/i.test(line) ||
                    lowerLine.includes('done') ||
                    lowerLine.includes('complete');

        // Look for specific task details (units, lessons, etc.)
        const unitsMatch = line.match(/(\d+)\s*(units?|lessons?)/i);
        const blocksMatch = line.match(/(\d+)\s*blocks?/i);
        
        if (unitsMatch) {
          taskDescription = taskDescription || `${unitsMatch[1]} ${unitsMatch[2]}`;
        } else if (blocksMatch) {
          taskDescription = taskDescription || `${blocksMatch[1]} blocks`;
        }

        // Clean up task description
        taskDescription = taskDescription
          .replace(/[✓✔☑\[\]x]/gi, '')
          .replace(/\s+/g, ' ')
          .trim();

        tasks[taskType].task = taskDescription;
        tasks[taskType].complete = isComplete;

        // Look for completion notes in next line
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].toLowerCase();
          if (nextLine.includes('did') || nextLine.includes('completed') || nextLine.includes('finished')) {
            tasks[taskType].notes = lines[i + 1].trim();
          }
        }
      }
    }

    return tasks;
  };

  const parseTranscript = (text) => {
    const studentBehaviors = [];
    const strategies = [];
    const observations = [];
    const challenges = [];
    const strengths = [];
    
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    
    let currentSection = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lowerLine = line.toLowerCase();
      
      // Identify major sections (headers without bullet points)
      if (!line.startsWith('*') && !line.startsWith('-') && 
          (line.endsWith(':') || /^[A-Z]/.test(line) && line.split(' ').length <= 5)) {
        currentSection = lowerLine;
        continue;
      }
      
      // Skip context/background information sections
      if (currentSection.includes('academic overview') ||
          currentSection.includes('cognitive processing') ||
          currentSection.includes('learning environment')) {
        // These are typically LG observations, not student voice
        continue;
      }
      
      // Extract student behaviors and reflections (bullet points)
      if (line.startsWith('*') || line.startsWith('-')) {
        const content = line.replace(/^[\*\-]\s*/, '').trim();
        
        // Filter out pure context/assessment statements
        if (lowerLine.includes('strong performance') ||
            lowerLine.includes('excellent quality') ||
            lowerLine.includes('struggles with') ||
            lowerLine.includes('often incomplete')) {
          // This is LG assessment, skip
          continue;
        }
        
        // Capture student-voiced challenges
        if (lowerLine.includes('distracted') ||
            lowerLine.includes('feels') ||
            lowerLine.includes('prefers') ||
            lowerLine.includes('remembers') ||
            lowerLine.includes('forgets') ||
            lowerLine.includes('helps') ||
            lowerLine.includes('creates anxiety')) {
          studentBehaviors.push(content);
        }
        
        // Capture proposed solutions/strategies
        if (currentSection.includes('support strategies') ||
            currentSection.includes('next steps') ||
            lowerLine.includes('strategy:') ||
            lowerLine.includes('solution:') ||
            lowerLine.includes('proposed')) {
          strategies.push(content);
        }
      }
      
      // Extract indented sub-bullets (often contain student voice)
      if (line.match(/^\s{2,}[\*\-]/)) {
        const content = line.replace(/^\s+[\*\-]\s*/, '').trim();
        
        // These are often direct student perspectives
        if (lowerLine.includes('→') || // Arrows often indicate student reasoning
            lowerLine.includes('expressed') ||
            lowerLine.includes('would')) {
          studentBehaviors.push(content);
        }
      }
    }
    
    // Create synthesized observations from student behaviors
    studentBehaviors.forEach(behavior => {
      // Convert third-person observations to first-person implied quotes
      let observation = behavior;
      
      // Transform key phrases to be more student-voice oriented
      observation = observation
        .replace(/^Student /, '')
        .replace(/^The student /, '');
      
      observations.push(observation);
    });

    return {
      rawText: text,
      studentBehaviors: observations,
      strategies: strategies,
      observations: observations,
      quotes: [] // No direct quotes in this format
    };
  };

  const parseGoalInfo = (text) => {
    const info = {
      studentName: '',
      weekNumber: '',
      meetingDate: '',
      workHabitGoal: '',
      characterHabitGoal: ''
    };

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lowerLine = line.toLowerCase();
      
      // Extract student name
      if (lowerLine.includes('student name') || lowerLine.includes('name:')) {
        // Try to get from same line first
        const colonSplit = line.split(':');
        if (colonSplit.length > 1 && colonSplit[1].trim()) {
          info.studentName = colonSplit[1].trim();
        } else if (i + 1 < lines.length) {
          // Check next line
          info.studentName = lines[i + 1];
        }
      }
      
      // Extract week number - more flexible matching
      if (lowerLine.includes('week')) {
        const weekMatch = line.match(/week\s*#?\s*(\d+)/i) || 
                         line.match(/week\s*(\d+)/i) ||
                         line.match(/wk\s*(\d+)/i);
        if (weekMatch) {
          info.weekNumber = weekMatch[1];
        }
      }
      
      // Extract date - multiple formats
      if (lowerLine.includes('date') || lowerLine.includes('met on')) {
        // Match various date formats: 5/5/25, 05/05/2025, May 5, 2025
        const dateMatch = line.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/) ||
                         line.match(/([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/) ||
                         line.match(/(\d{1,2}-\d{1,2}-\d{2,4})/);
        if (dateMatch) {
          info.meetingDate = dateMatch[1];
        }
      }
      
      // Extract Work Habit Goal
      if (lowerLine.includes('work habit') || lowerLine.includes('wh goal')) {
        // Look for the goal in next line(s)
        let goalText = '';
        let j = i + 1;
        
        // Skip label lines like "Goal:" or empty lines
        while (j < lines.length && (lines[j].toLowerCase().includes('goal:') || !lines[j].trim())) {
          j++;
        }
        
        // Collect goal text until we hit another section
        while (j < lines.length && 
               !lines[j].toLowerCase().includes('character habit') &&
               !lines[j].toLowerCase().includes('personal goal') &&
               !lines[j].toLowerCase().includes('academic goal') &&
               lines[j].trim()) {
          goalText += (goalText ? ' ' : '') + lines[j];
          j++;
          // Stop if we've collected a substantial goal (usually 1-2 lines)
          if (goalText.length > 50 && (goalText.endsWith('.') || goalText.endsWith('.'))) {
            break;
          }
        }
        
        if (goalText) {
          info.workHabitGoal = goalText.trim();
        }
      }
      
      // Extract Character Habit Goal
      if (lowerLine.includes('character habit') || lowerLine.includes('ch goal')) {
        let goalText = '';
        let j = i + 1;
        
        // Skip label lines
        while (j < lines.length && (lines[j].toLowerCase().includes('goal:') || !lines[j].trim())) {
          j++;
        }
        
        // Collect goal text
        while (j < lines.length && 
               !lines[j].toLowerCase().includes('work habit') &&
               !lines[j].toLowerCase().includes('personal goal') &&
               !lines[j].toLowerCase().includes('academic goal') &&
               lines[j].trim()) {
          goalText += (goalText ? ' ' : '') + lines[j];
          j++;
          if (goalText.length > 50 && (goalText.endsWith('.') || goalText.endsWith('.'))) {
            break;
          }
        }
        
        if (goalText) {
          info.characterHabitGoal = goalText.trim();
        }
      }
    }

    return info;
  };

  const generateGoalTracker = async () => {
    // Check if we have all required inputs (either files or text)
    const hasTranscript = files.transcript || (useTextInput.transcript && textInputs.transcriptText.trim());
    const hasTracker = files.treehouseTracker;
    const hasGoalInfo = files.goalInfo || (useTextInput.goalInfo && textInputs.goalInfoText.trim());
    
    if (!hasTranscript || !hasTracker || !hasGoalInfo) {
      setError('Please provide all three required inputs (either as files or text)');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      // Extract text from documents or use text input
      const transcriptText = useTextInput.transcript 
        ? textInputs.transcriptText 
        : await extractTextFromDocx(files.transcript);
      
      const trackerText = await extractTextFromDocx(files.treehouseTracker);
      
      const goalInfoText = useTextInput.goalInfo 
        ? textInputs.goalInfoText 
        : await extractTextFromDocx(files.goalInfo);

      // Parse each document
      const tasks = parseTreehouseTracker(trackerText);
      const transcript = parseTranscript(transcriptText);
      const goalInfo = parseGoalInfo(goalInfoText);

      // Generate formatted output
      const formattedOutput = generateFormattedTracker(goalInfo, tasks, transcript);
      setOutput(formattedOutput);

    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const generateFormattedTracker = (info, tasks, transcript) => {
    // Build deliberate practice work completion section
    const workSections = [
      { name: 'Reading', data: tasks.reading },
      { name: 'Writing', data: tasks.writing },
      { name: 'Computation', data: tasks.computation },
      { name: 'Communication', data: tasks.communication || { task: '', complete: false, notes: '' } },
      { name: 'CTWS', data: tasks.ctws },
      { name: 'Observation', data: tasks.observation }
    ];

    const workCompletionTable = workSections
      .filter(section => section.data.task) // Only include sections with tasks
      .map(section => {
        const status = section.data.complete ? 'Done' : 'Incomplete';
        return `${section.name}\n${section.data.task}\n${status}${section.data.notes ? `\n${section.data.notes}` : ''}`;
      }).join('\n\n');

    // Build learning guide comments from transcript
    let lgComments = '';
    
    // Synthesize session narrative from student behaviors and strategies
    if (transcript.studentBehaviors && transcript.studentBehaviors.length > 0) {
      const behaviors = transcript.studentBehaviors.slice(0, 5);
      lgComments = behaviors.map(b => `Student ${b.charAt(0).toLowerCase() + b.slice(1)}`).join('. ') + '.';
    }
    
    // Add strategies discussed
    if (transcript.strategies && transcript.strategies.length > 0) {
      const strategies = transcript.strategies.slice(0, 3);
      if (lgComments) lgComments += '\n\n';
      lgComments += 'We discussed the following strategies: ' + strategies.join('; ') + '.';
    }
    
    // Default if no content
    if (!lgComments.trim()) {
      lgComments = 'Student and Learning Guide discussed progress on work habits and goals during this week\'s 1:1 session.';
    }

    return `**Notes for Week ${info.weekNumber}**

**1:1 Date - ${info.meetingDate}**

**Summaries**

**Learning Guide Comments**
${lgComments}

**Deliberate Practice Work Completion (Week of ${info.meetingDate})**

${workCompletionTable || '*No work tasks recorded this week*'}

**Parent Reflection/Comments to Student**
[To be completed by parent]`;
  };

  const downloadOutput = () => {
    if (!output) return;
    
    const element = document.createElement('a');
    const file = new Blob([output], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `GoalTracker_Week${Date.now()}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const copyToClipboard = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    alert('Goal tracker copied to clipboard!');
  };

  const FileUploadBox = ({ title, fileType, description, allowTextInput = false }) => (
    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-indigo-400 transition-colors">
      {allowTextInput && (
        <div className="mb-4">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={useTextInput[fileType]}
              onChange={(e) => setUseTextInput(prev => ({ ...prev, [fileType]: e.target.checked }))}
              className="w-4 h-4 text-indigo-600 rounded"
            />
            Use text input instead of file
          </label>
        </div>
      )}

      {allowTextInput && useTextInput[fileType] ? (
        <div>
          <label className="block mb-2">
            <div className="flex items-center gap-3 mb-2">
              <FileText className="w-6 h-6 text-indigo-600" />
              <div>
                <p className="font-medium text-gray-700">{title}</p>
                <p className="text-sm text-gray-500">{description}</p>
              </div>
            </div>
          </label>
          <textarea
            value={textInputs[`${fileType}Text`]}
            onChange={(e) => setTextInputs(prev => ({ ...prev, [`${fileType}Text`]: e.target.value }))}
            rows={8}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
            placeholder={`Paste ${title.toLowerCase()} here...`}
          />
        </div>
      ) : (
        <label className="block cursor-pointer">
          <div className="flex flex-col items-center gap-3">
            <Upload className={`w-8 h-8 ${files[fileType] ? 'text-green-600' : 'text-gray-400'}`} />
            <div className="text-center">
              <p className="font-medium text-gray-700">{title}</p>
              <p className="text-sm text-gray-500 mt-1">{description}</p>
              {files[fileType] && (
                <div className="flex items-center gap-2 mt-2 text-green-600">
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-sm">{files[fileType].name}</span>
                </div>
              )}
            </div>
          </div>
          <input
            type="file"
            accept=".docx"
            onChange={(e) => handleFileUpload(fileType, e.target.files[0])}
            className="hidden"
            disabled={allowTextInput && useTextInput[fileType]}
          />
        </label>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <FileText className="w-8 h-8 text-indigo-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-800">AL2 Goal Tracker Generator</h1>
              <p className="text-gray-600 mt-1">Upload documents to automatically generate formatted goal trackers</p>
            </div>
          </div>

          {/* File Upload Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <FileUploadBox
              title="1:1 Transcript"
              fileType="transcript"
              description="Session notes & student conversation"
              allowTextInput={true}
            />
            <FileUploadBox
              title="Treehouse Tracker"
              fileType="treehouseTracker"
              description="Work completion checklist"
              allowTextInput={false}
            />
            <FileUploadBox
              title="Goal Info"
              fileType="goalInfo"
              description="Student name, week #, goals"
              allowTextInput={true}
            />
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <p className="font-medium text-red-800">Error</p>
                <p className="text-red-700 text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Generate Button */}
          <button
            onClick={generateGoalTracker}
            disabled={processing}
            className="w-full bg-indigo-600 text-white px-6 py-4 rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            {processing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing Documents...
              </>
            ) : (
              <>
                <FileText className="w-5 h-5" />
                Generate Goal Tracker
              </>
            )}
          </button>
        </div>

                  {/* Output Section */}
        {output && (
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">Generated Goal Tracker</h2>
              <div className="flex gap-3">
                <button
                  onClick={copyToClipboard}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Copy
                </button>
                <button
                  onClick={downloadOutput}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
              </div>
            </div>
            
            {/* Manual Override Checkboxes */}
            <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h3 className="font-semibold text-gray-800 mb-3">Manual Work Completion Override</h3>
              <p className="text-sm text-gray-600 mb-3">Check these boxes if the transcript didn't capture completion status:</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {['Reading', 'Writing', 'Computation', 'Communication', 'CTWS', 'Observation'].map(subject => (
                  <label key={subject} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-indigo-600 rounded"
                      onChange={(e) => {
                        // Update completion status manually
                        const subjectKey = subject.toLowerCase();
                        // This would need state management to update the output
                      }}
                    />
                    {subject} Completed
                  </label>
                ))}
              </div>
            </div>
            
            <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
              <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700">
                {output}
              </pre>
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="bg-white rounded-lg shadow-lg p-8 mt-6">
          <h3 className="font-bold text-gray-800 mb-3">How to Use</h3>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li>Upload your <strong>1:1 Transcript</strong> (.docx) containing session notes and student quotes</li>
            <li>Upload your <strong>Treehouse Tracker</strong> (.docx) showing work tasks and completion status</li>
            <li>Upload <strong>Goal Info</strong> (.docx) with student name, week number, date, and habit goals</li>
            <li>Click "Generate Goal Tracker" to automatically create formatted output</li>
            <li>Review, copy, or download the generated tracker</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default GoalTrackerGenerator;
