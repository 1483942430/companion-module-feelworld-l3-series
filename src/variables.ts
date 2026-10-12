import type ModuleInstance from './main.js'

export type VariablesSchema = {
	current_pgm: number
	current_pvw: number
}

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	self.setVariableDefinitions({
		current_pgm: { name: 'Current Program Source' },
		current_pvw: { name: 'Current Preview Source' },
	})
}
