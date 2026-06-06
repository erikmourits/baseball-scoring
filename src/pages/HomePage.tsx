export default function HomePage() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-gray-900">Games</h1>
      <p className="text-gray-500 mt-1">No games yet. Start a new game to begin scoring.</p>
      <button className="mt-6 w-full bg-brand-500 text-white font-medium py-3 px-4 rounded-xl hover:bg-brand-600 active:bg-brand-700 transition-colors">
        + New Game
      </button>
    </div>
  )
}
