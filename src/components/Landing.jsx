import React from "react";

export default function Landing({ onStart }) {
	return (
		<div className="text-center">
			<h1 className="text-2xl font-bold text-gray-800 mb-4">LabelSense AI</h1>
			<p className="text-gray-600 mb-6">Scan an ingredient label to get instant insights.</p>
			<button
				onClick={() => onStart?.()}
				className="bg-emerald-600 text-white px-6 py-3 rounded-full w-full"
			>
				Scan an ingredient label
			</button>
		</div>
	);
}
