#!/usr/bin/env bash

files=(conversation-*-*-*.wav)

# Build the FFmpeg command
cmd="ffmpeg"
filter=""
count=${#files[@]}
idx=0

# Add each file as an input
for f in "${files[@]}"; do
  cmd+=" -i \"$f\""
done

# Build filter graph for each input
for f in "${files[@]}"; do
  t="${f##*-}"    # extract the numeric offset in ms
  t="${t%.wav}"

  # FFmpeg adelay filter takes milliseconds
  offset_ms="$t"

  echo "DEBUG: file=$f, timestamp(ms)=$offset_ms"

  # Apply the delay to each audio input
  filter+="[$idx:a]adelay=${offset_ms}|${offset_ms}[a$idx];"
  ((idx++))
done

# Now mix all delayed inputs
mix=""
for ((i=0; i<idx; i++)); do
  mix+="[a$i]"
done
mix+="amix=inputs=$count:normalize=0"

filter+="$mix"

# -c:a pcm_s16le means output a standard WAV
cmd+=" -filter_complex \"$filter\" -c:a pcm_s16le merged_ffmpeg.wav"

echo "Running: $cmd"
eval "$cmd"

echo "Done! Created merged_ffmpeg.wav"
