import React, { useState } from 'react';
import './App.css';

function App() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [freelancerGithub, setFreelancerGithub] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [projectData, setProjectData] = useState(null);

  const [statusId, setStatusId] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [statusData, setStatusData] = useState(null);

  const handleCreateProject = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setProjectData(null);

    try {
      const response = await fetch('http://127.0.0.1:8000/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          description,
          freelancer_github: freelancerGithub,
        }),
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.statusText}`);
      }

      const data = await response.json();
      setProjectData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGetStatus = async (e) => {
    e.preventDefault();
    setStatusLoading(true);
    setStatusError('');
    setStatusData(null);

    try {
      const response = await fetch(`http://127.0.0.1:8000/projects/${statusId}/status`);

      if (!response.ok) {
        throw new Error(`Error: ${response.statusText}`);
      }

      const data = await response.json();
      setStatusData(data);
    } catch (err) {
      setStatusError(err.message);
    } finally {
      setStatusLoading(false);
    }
  };

  return (
    <div className="container">
      <h1>Automated Freelance Verification Platform</h1>
      
      <div className="section">
        <h2>Create Project</h2>
        <form onSubmit={handleCreateProject} className="form">
          <div className="form-group">
            <label>Project Name:</label>
            <input 
              type="text" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              required 
            />
          </div>
          <div className="form-group">
            <label>Description:</label>
            <textarea 
              value={description} 
              onChange={(e) => setDescription(e.target.value)} 
              required 
              rows="4"
            />
          </div>
          <div className="form-group">
            <label>Freelancer Github (optional):</label>
            <input 
              type="text" 
              value={freelancerGithub} 
              onChange={(e) => setFreelancerGithub(e.target.value)} 
            />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? 'Creating...' : 'Create Project'}
          </button>
        </form>

        {error && <div className="error">{error}</div>}
        
        {projectData && (
          <div className="result">
            <h3>Project Created!</h3>
            <p><strong>Repository:</strong> <a href={projectData.repo_url} target="_blank" rel="noreferrer">{projectData.repo_url}</a></p>
            <h4>Generated Milestones:</h4>
            <div className="milestones-list">
              {projectData.milestones.map((m, i) => (
                <details key={i} className="milestone-item">
                  <summary>
                    <strong>{m.title}</strong> <span className={`badge ${m.status}`}>{m.status}</span>
                  </summary>
                  <div className="milestone-desc">{m.description}</div>
                </details>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="section">
        <h2>Check Project Status</h2>
        <form onSubmit={handleGetStatus} className="form form-inline">
          <input 
            type="number" 
            placeholder="Project ID" 
            value={statusId} 
            onChange={(e) => setStatusId(e.target.value)} 
            required 
          />
          <button type="submit" disabled={statusLoading}>
            {statusLoading ? 'Checking...' : 'Check Status'}
          </button>
        </form>

        {statusError && <div className="error">{statusError}</div>}
        
        {statusData && (
          <div className="result">
            <h3>Status: {statusData.project}</h3>
            <div className="milestones-list">
              {statusData.milestones.map((m, i) => (
                <details key={i} className="milestone-item">
                  <summary>
                    <strong>{m.title}</strong> <span className={`badge ${m.status}`}>{m.status}</span>
                  </summary>
                  <div className="milestone-desc">{m.description}</div>
                </details>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
