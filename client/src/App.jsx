import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Home from './pages/Home';

function App() {
  const [showHistory, setShowHistory] = useState(false);

  return (
    <Router>
      <Header showHistory={showHistory} setShowHistory={setShowHistory} />
      <Routes>
        <Route path="/" element={<Home showHistory={showHistory} setShowHistory={setShowHistory} />} />
      </Routes>
    </Router>
  );
}

export default App;
