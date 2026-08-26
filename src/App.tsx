import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Home } from './screens/Home'
import { Host } from './screens/Host'
import { PlayerScreen } from './screens/PlayerScreen'
import { Replay } from './screens/Replay'
import { MatchHistory } from './screens/MatchHistory'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/host/:code" element={<Host />} />
        <Route path="/play/:code" element={<PlayerScreen />} />
        <Route path="/join" element={<Home />} />
        <Route path="/replay/:matchId" element={<Replay />} />
        <Route path="/history/:roomId" element={<MatchHistory />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App