package com.verifd.android.ui.adapter

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.verifd.android.data.model.VPassEntry
import com.verifd.android.databinding.ItemVpassBinding
import com.verifd.android.util.PhoneNumberUtils

/**
 * RecyclerView adapter for vPass entries
 */
class VPassAdapter(
    private val onItemClick: (VPassEntry) -> Unit
) : ListAdapter<VPassEntry, VPassAdapter.VPassViewHolder>(VPassDiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VPassViewHolder {
        val binding = ItemVpassBinding.inflate(
            LayoutInflater.from(parent.context),
            parent,
            false
        )
        return VPassViewHolder(binding)
    }

    override fun onBindViewHolder(holder: VPassViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    inner class VPassViewHolder(
        private val binding: ItemVpassBinding
    ) : RecyclerView.ViewHolder(binding.root) {

        init {
            binding.root.setOnClickListener {
                val position = absoluteAdapterPosition
                if (position != RecyclerView.NO_POSITION) {
                    onItemClick(getItem(position))
                }
            }
        }

        fun bind(vPass: VPassEntry) {
            binding.apply {
                phoneNumberText.text = PhoneNumberUtils.format(vPass.phoneNumber)
                nameText.text = vPass.name
                durationText.text = vPass.duration.toDisplayString()
                remainingTimeText.text = vPass.getRemainingTimeString()
                
                // Set status indicator color based on remaining time
                val remainingMs = vPass.getRemainingTimeMs()
                val statusColor = when {
                    remainingMs <= 0 -> android.graphics.Color.RED
                    remainingMs < 60 * 60 * 1000 -> android.graphics.Color.YELLOW // Less than 1 hour
                    else -> android.graphics.Color.GREEN
                }
                
                statusIndicator.setBackgroundColor(statusColor)
            }
        }
    }
}

/**
 * DiffUtil callback for efficient list updates
 */
class VPassDiffCallback : DiffUtil.ItemCallback<VPassEntry>() {
    override fun areItemsTheSame(oldItem: VPassEntry, newItem: VPassEntry): Boolean {
        return oldItem.phoneNumber == newItem.phoneNumber
    }

    override fun areContentsTheSame(oldItem: VPassEntry, newItem: VPassEntry): Boolean {
        return oldItem == newItem
    }
}