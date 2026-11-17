import killPort from 'kill-port'

export const killPortProcess = async (port: number) => {
  try {
    await killPort(port)
  } catch (error) {
    console.log(`No process running on port ${port} ${error && error['message']}`)
  }
}
